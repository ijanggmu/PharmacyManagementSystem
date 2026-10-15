using FSH.Framework.Shared.Persistence;
using FSH.Modules.Suppliers.Contracts.Dtos;
using FSH.Modules.Suppliers.Contracts.v1.PriceLists;
using FSH.Modules.Suppliers.Data;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Suppliers.Features.v1.PriceLists.SearchSupplierPriceList;

/// <summary>Price-list rows, newest start first; medicine names and pack sizes come from Inventory.</summary>
public sealed class SearchSupplierPriceListQueryHandler(SuppliersDbContext dbContext, IMediator mediator)
    : IQueryHandler<SearchSupplierPriceListQuery, PagedResponse<SupplierPriceListItemDto>>
{
    public async ValueTask<PagedResponse<SupplierPriceListItemDto>> Handle(
        SearchSupplierPriceListQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        var items = dbContext.SupplierPriceListItems.AsNoTracking();
        if (!query.IncludeInactive)
        {
            items = items.Where(i => i.IsActive);
        }

        if (query.SupplierId is { } supplierId)
        {
            items = items.Where(i => i.SupplierId == supplierId);
        }

        if (query.MedicineId is { } medicineId)
        {
            items = items.Where(i => i.MedicineId == medicineId);
        }

        if (query.ActiveOn is { } on)
        {
            items = items.Where(i => i.ValidFrom <= on && (i.ValidTo == null || i.ValidTo >= on));
        }

        long total = await items.LongCountAsync(cancellationToken).ConfigureAwait(false);
        var page = await items
            .OrderBy(i => i.MedicineId)
            .ThenByDescending(i => i.ValidFrom)
            .Skip((query.PageNumber - 1) * query.PageSize)
            .Take(query.PageSize)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        var medicines = await PriceListMedicines.ResolveAsync(mediator, page.Select(i => i.MedicineId), cancellationToken)
            .ConfigureAwait(false);

        var rows = page
            .Select(i =>
            {
                var (name, unitsPerPack) = medicines[i.MedicineId];
                return new SupplierPriceListItemDto(
                    i.Id, i.SupplierId, i.MedicineId, name, unitsPerPack, i.UnitCost, i.MinOrderQuantity,
                    i.ValidFrom, i.ValidTo, i.Notes, i.IsActive, i.CreatedAtUtc, i.UpdatedAtUtc);
            })
            // Group a medicine's rows together by name; the newest window first within it.
            .OrderBy(r => r.MedicineName, StringComparer.CurrentCultureIgnoreCase)
            .ThenByDescending(r => r.ValidFrom)
            .ToList();

        return new PagedResponse<SupplierPriceListItemDto>
        {
            Items = rows,
            PageNumber = query.PageNumber,
            PageSize = query.PageSize,
            TotalCount = total,
            TotalPages = (int)Math.Ceiling(total / (double)query.PageSize),
        };
    }
}
