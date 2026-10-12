using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Inventory.Data;

/// <summary>
/// Row locks for read-modify-write paths that change a batch's quantity outside the FEFO deduction
/// (which locks its own candidates in <c>StockDeductionService</c>). Same approach as Sales'
/// <c>SalesTransaction.LockSaleRowAsync</c>.
/// </summary>
internal static class InventoryRowLocks
{
    /// <summary>
    /// Locks a batch row (<c>SELECT ... FOR UPDATE</c>) for the rest of the caller's transaction, so a
    /// concurrent sale or transfer can't change its quantity between this caller's read and write.
    /// Call it inside the transaction and before loading the batch. A batch that isn't visible to this
    /// tenant is not locked; the caller's tracked load then raises NotFound.
    /// </summary>
    public static async Task LockBatchRowAsync(InventoryDbContext dbContext, Guid batchId, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(dbContext);

        if (!dbContext.Database.IsRelational())
        {
            return;
        }

        // Tenant-filtered existence check first, so the raw lock never touches another tenant's row.
        bool visible = await dbContext.MedicineBatches.AsNoTracking()
            .AnyAsync(b => b.Id == batchId, cancellationToken)
            .ConfigureAwait(false);
        if (!visible)
        {
            return;
        }

        _ = await dbContext.Database.SqlQuery<Guid>($"""
            SELECT "Id" FROM inventory."MedicineBatches" WHERE "Id" = {batchId} FOR UPDATE
            """).ToArrayAsync(cancellationToken).ConfigureAwait(false);
    }
}
