using FSH.Modules.Inventory.Data;
using FSH.Modules.Inventory.Domain;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Inventory.Services;

/// <summary>
/// Consigned stock belongs to the supplier until it is sold (and settled): it was never booked into the
/// pharmacy's Inventory account, so writing it off or adjusting it must not post a stock loss or gain to the
/// books. The units go back to, or are settled with, the supplier instead.
/// </summary>
internal static class ConsignedStock
{
    public static Task<bool> IsConsignedAsync(InventoryDbContext dbContext, Guid batchId, CancellationToken cancellationToken) =>
        dbContext.ConsignmentPositions.AsNoTracking().AnyAsync(p => p.BatchId == batchId, cancellationToken);

    /// <summary>The ids among <paramref name="batchIds"/> that are consigned lots.</summary>
    public static async Task<HashSet<Guid>> ConsignedAmongAsync(
        InventoryDbContext dbContext, IReadOnlyCollection<Guid> batchIds, CancellationToken cancellationToken)
    {
        if (batchIds.Count == 0)
        {
            return [];
        }

        var ids = await dbContext.ConsignmentPositions.AsNoTracking()
            .Where(p => batchIds.Contains(p.BatchId))
            .Select(p => p.BatchId)
            .Distinct()
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);
        return [.. ids];
    }

    /// <summary>
    /// Net units SOLD from each of <paramref name="batchIds"/>, counted from the inventory ledger: sale draws
    /// (<see cref="InventoryTransactionType.Sale"/> rows referencing a sale) less units put back by cancellations and
    /// customer returns (<see cref="InventoryTransactionType.SaleReversal"/>), never below zero. Write-offs, count
    /// shortfalls, supplier returns and transfers are not sales. Settlement bills exactly this and the positions report
    /// shows it, so the two always agree.
    /// </summary>
    public static async Task<Dictionary<Guid, decimal>> SoldFromLotsAsync(
        InventoryDbContext dbContext, IReadOnlyCollection<Guid> batchIds, CancellationToken cancellationToken)
    {
        if (batchIds.Count == 0)
        {
            return [];
        }

        var movements = await dbContext.InventoryTransactions.AsNoTracking()
            .Where(t => t.MedicineBatchId != null && batchIds.Contains(t.MedicineBatchId.Value)
                && ((t.Type == InventoryTransactionType.Sale && t.ReferenceType == SaleReferenceType)
                    || t.Type == InventoryTransactionType.SaleReversal))
            .GroupBy(t => t.MedicineBatchId!.Value)
            .Select(g => new { BatchId = g.Key, NetDelta = g.Sum(t => t.QuantityDelta) })
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        // Sale draws are negative and restocks positive, so sold = -(net), never below zero.
        return movements.ToDictionary(m => m.BatchId, m => Math.Max(0m, -m.NetDelta));
    }

    private const string SaleReferenceType = "Sale";
}
