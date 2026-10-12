using FSH.Modules.Inventory.Data;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Inventory.Services;

/// <summary>
/// Consigned stock belongs to the supplier until it is sold (and settled): it was never booked into the
/// pharmacy's Inventory account, so writing it off or adjusting it must not post a stock loss or gain to the
/// books — the units go back to, or are settled with, the supplier instead.
/// </summary>
internal static class ConsignedStock
{
    public static Task<bool> IsConsignedAsync(InventoryDbContext dbContext, Guid batchId, CancellationToken cancellationToken) =>
        dbContext.ConsignmentPositions.AsNoTracking().AnyAsync(p => p.BatchId == batchId, cancellationToken);
}
