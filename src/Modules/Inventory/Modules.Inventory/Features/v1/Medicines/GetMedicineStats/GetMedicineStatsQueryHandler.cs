using FSH.Modules.Inventory.Contracts.Dtos;
using FSH.Modules.Inventory.Contracts.v1.Medicines;
using FSH.Modules.Inventory.Data;
using FSH.Modules.Inventory.Services;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Inventory.Features.v1.Medicines.GetMedicineStats;

/// <summary>
/// Tenant-wide counts for the inventory stat cards (legacy getMedicineInventoryStats). Low stock is
/// total on-hand at or below the reorder level (zero stock included). Expiring/expired use the nearest
/// batch expiry from <see cref="MedicineBatchAggregator"/>. Archived medicines are excluded.
/// </summary>
public sealed class GetMedicineStatsQueryHandler(InventoryDbContext dbContext, TimeProvider timeProvider, ICurrentBranch currentBranch)
    : IQueryHandler<GetMedicineStatsQuery, MedicineStatsDto>
{
    public async ValueTask<MedicineStatsDto> Handle(GetMedicineStatsQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        var medicines = await dbContext.Medicines
            .AsNoTracking()
            .Select(m => new { m.Id, m.ReorderLevel })
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        // Same stock scope as the medicine list: a selected (or the caller's confined) branch, else all.
        Guid? branchId = await currentBranch.ResolveListBranchFilterAsync(query.BranchId, cancellationToken).ConfigureAwait(false);

        var batches = await dbContext.MedicineBatches
            .AsNoTracking()
            .Where(b => branchId == null || b.BranchId == branchId)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        var today = DateOnly.FromDateTime(timeProvider.GetUtcNow().UtcDateTime);
        var soon = today.AddDays(30);

        var onHandByMedicine = batches
            .Where(b => !b.IsDisposed)
            .GroupBy(b => b.MedicineId)
            .ToDictionary(g => g.Key, g => g.Sum(b => b.QuantityOnHand));
        // Stock at what it sells for: each batch at its own selling price (the only selling price).
        var retailValueByMedicine = batches
            .Where(b => !b.IsDisposed)
            .GroupBy(b => b.MedicineId)
            .ToDictionary(g => g.Key, g => g.Sum(b => b.QuantityOnHand * b.SellingPrice));
        var aggregates = MedicineBatchAggregator.Aggregate(batches, today);

        int lowStock = 0;
        int expiringSoon = 0;
        int expired = 0;
        decimal totalValue = 0m;

        foreach (var m in medicines)
        {
            decimal onHand = onHandByMedicine.GetValueOrDefault(m.Id);
            if (onHand <= m.ReorderLevel)
            {
                lowStock++;
            }

            if (aggregates.GetOrEmpty(m.Id).NearestExpiry is { } expiry)
            {
                if (expiry < today) expired++;
                else if (expiry <= soon) expiringSoon++;
            }

            totalValue += retailValueByMedicine.GetValueOrDefault(m.Id);
        }

        return new MedicineStatsDto(medicines.Count, lowStock, expiringSoon, expired, totalValue);
    }
}
