using FSH.Modules.Inventory.Data;
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
}
