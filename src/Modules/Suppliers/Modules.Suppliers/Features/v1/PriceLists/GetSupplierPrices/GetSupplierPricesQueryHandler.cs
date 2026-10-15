using FSH.Modules.Inventory.Contracts.v1.Medicines;
using FSH.Modules.Suppliers.Contracts.Dtos;
using FSH.Modules.Suppliers.Contracts.v1.PriceLists;
using FSH.Modules.Suppliers.Data;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Suppliers.Features.v1.PriceLists.GetSupplierPrices;

/// <summary>
/// The price valid on the date for each requested medicine: among the supplier's active rows whose window covers
/// AsOf (ValidFrom on or before it, ValidTo open or on/after it), the one with the latest ValidFrom. Names come
/// from Inventory in one batch (<see cref="GetMedicineNamesQuery"/>).
/// </summary>
public sealed class GetSupplierPricesQueryHandler(SuppliersDbContext dbContext, IMediator mediator)
    : IQueryHandler<GetSupplierPricesQuery, IReadOnlyList<SupplierPriceDto>>
{
    public async ValueTask<IReadOnlyList<SupplierPriceDto>> Handle(GetSupplierPricesQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        var medicineIds = (query.MedicineIds ?? []).Where(id => id != Guid.Empty).Distinct().ToList();
        if (medicineIds.Count == 0)
        {
            return [];
        }

        DateOnly asOf = query.AsOf;
        var candidates = await dbContext.SupplierPriceListItems.AsNoTracking()
            .Where(i => i.IsActive
                && i.SupplierId == query.SupplierId
                && medicineIds.Contains(i.MedicineId)
                && i.ValidFrom <= asOf
                && (i.ValidTo == null || i.ValidTo >= asOf))
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);
        if (candidates.Count == 0)
        {
            return [];
        }

        var chosen = candidates
            .GroupBy(i => i.MedicineId)
            .Select(g => g.OrderByDescending(i => i.ValidFrom).ThenByDescending(i => i.CreatedAtUtc).First())
            .ToList();

        var names = await mediator.Send(new GetMedicineNamesQuery(chosen.Select(i => i.MedicineId).ToList()), cancellationToken)
            .ConfigureAwait(false);

        return chosen
            .Select(i => new SupplierPriceDto(
                i.Id, i.SupplierId, i.MedicineId,
                names.TryGetValue(i.MedicineId, out var name) ? name : PriceListMedicines.UnknownName,
                i.UnitCost, i.MinOrderQuantity, i.ValidFrom, i.ValidTo))
            .OrderBy(p => p.MedicineName, StringComparer.CurrentCultureIgnoreCase)
            .ToList();
    }
}
