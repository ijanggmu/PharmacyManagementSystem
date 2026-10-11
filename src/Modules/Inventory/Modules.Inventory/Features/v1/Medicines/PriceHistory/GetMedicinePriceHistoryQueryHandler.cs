using FSH.Modules.Inventory.Contracts.Dtos;
using FSH.Modules.Inventory.Contracts.v1.Medicines;
using FSH.Modules.Inventory.Data;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Inventory.Features.v1.Medicines.PriceHistory;

/// <summary>
/// Ported from GET app/api/medicines/[id]/price-history/route.ts + `listMedicinePriceHistory`:
/// every non-cancelled row for the medicine, newest effective date first (ties broken by
/// newest created).
/// </summary>
public sealed class GetMedicinePriceHistoryQueryHandler(InventoryDbContext dbContext)
    : IQueryHandler<GetMedicinePriceHistoryQuery, List<MedicinePriceHistoryDto>>
{
    public async ValueTask<List<MedicinePriceHistoryDto>> Handle(
        GetMedicinePriceHistoryQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        var rows = await dbContext.MedicinePriceHistories
            .AsNoTracking()
            .Where(h => h.MedicineId == query.MedicineId && h.Status != Domain.MedicinePriceHistoryStatus.Cancelled)
            .OrderByDescending(h => h.EffectiveFrom)
            .ThenByDescending(h => h.CreatedAtUtc)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        return rows
            .Select(h => new MedicinePriceHistoryDto(
                h.Id, h.MedicineId, h.UnitPrice, h.CostPrice, h.EffectiveFrom, h.EffectiveTo,
                h.Status.ToString(), h.Reason, h.CreatedAtUtc))
            .ToList();
    }
}
