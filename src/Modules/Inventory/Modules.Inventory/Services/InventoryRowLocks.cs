using FSH.Modules.Inventory.Data;
using FSH.Modules.Inventory.Domain;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Inventory.Services;

/// <summary>
/// Row locks for read-modify-write flows (lock, then re-read — the pattern
/// <see cref="StockDeductionService"/> uses for sales). The caller must already have a transaction
/// open: the <c>SELECT ... FOR UPDATE</c> locks are held until it ends, so a second writer of the same
/// row waits and then reads the committed value instead of overwriting it with a stale one.
///
/// Rows within ONE call are locked in id order. That only rules out deadlocks when every flow takes all
/// the lots it will write in a single id-ordered call, before writing any of them: a flow that locks lot
/// A now and lot B later (one call per line, or "lock it when I first need it") can still deadlock with a
/// flow holding B and waiting for A, whatever order each single call uses. So callers collect every lot
/// id first and lock them together — the sale deduction, receipts, restocks and transfer legs all do.
/// Ids come from a normal LINQ query first (tenant filter applied); locking an id
/// the caller cannot see is harmless, because the re-read through the tenant-filtered context then
/// finds nothing. Non-relational providers (InMemory unit tests) cannot express row locks; there the
/// calls are no-ops and the re-read is a plain read.
/// </summary>
internal static class InventoryRowLocks
{
    /// <summary>Locks the given batch rows and returns them tracked with their committed values.
    /// An unchanged entity this context already tracks is reloaded, so a quantity read before the lock
    /// is never reused.</summary>
    public static async Task<List<MedicineBatch>> LockBatchesAsync(
        InventoryDbContext dbContext, IReadOnlyCollection<Guid> batchIds, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(dbContext);
        ArgumentNullException.ThrowIfNull(batchIds);
        if (batchIds.Count == 0)
        {
            return [];
        }

        Guid[] ids = batchIds.Distinct().OrderBy(id => id).ToArray();
        if (dbContext.Database.IsRelational())
        {
            await dbContext.Database.SqlQuery<Guid>($"""
                SELECT "Id" FROM inventory."MedicineBatches"
                WHERE "Id" = ANY({ids})
                ORDER BY "Id"
                FOR UPDATE
                """).ToArrayAsync(cancellationToken).ConfigureAwait(false);
        }

        await ReloadTrackedAsync<MedicineBatch>(dbContext, ids, b => b.Id, cancellationToken).ConfigureAwait(false);

        return await dbContext.MedicineBatches
            .Where(b => ids.Contains(b.Id))
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);
    }

    /// <summary>Locks one stock transfer row and returns it tracked with its committed status, or null.</summary>
    public static async Task<StockTransfer?> LockStockTransferAsync(
        InventoryDbContext dbContext, Guid transferId, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(dbContext);
        if (dbContext.Database.IsRelational())
        {
            await dbContext.Database.SqlQuery<Guid>($"""
                SELECT "Id" FROM inventory."StockTransfers"
                WHERE "Id" = {transferId}
                FOR UPDATE
                """).ToArrayAsync(cancellationToken).ConfigureAwait(false);
        }

        await ReloadTrackedAsync<StockTransfer>(dbContext, [transferId], t => t.Id, cancellationToken).ConfigureAwait(false);

        return await dbContext.StockTransfers
            .FirstOrDefaultAsync(t => t.Id == transferId, cancellationToken)
            .ConfigureAwait(false);
    }

    /// <summary>Locks the given consignment positions and returns them tracked with committed values.</summary>
    public static async Task<List<ConsignmentPosition>> LockConsignmentPositionsAsync(
        InventoryDbContext dbContext, IReadOnlyCollection<Guid> positionIds, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(dbContext);
        ArgumentNullException.ThrowIfNull(positionIds);
        if (positionIds.Count == 0)
        {
            return [];
        }

        Guid[] ids = positionIds.Distinct().OrderBy(id => id).ToArray();
        if (dbContext.Database.IsRelational())
        {
            await dbContext.Database.SqlQuery<Guid>($"""
                SELECT "Id" FROM inventory."ConsignmentPositions"
                WHERE "Id" = ANY({ids})
                ORDER BY "Id"
                FOR UPDATE
                """).ToArrayAsync(cancellationToken).ConfigureAwait(false);
        }

        await ReloadTrackedAsync<ConsignmentPosition>(dbContext, ids, p => p.Id, cancellationToken).ConfigureAwait(false);

        return await dbContext.ConsignmentPositions
            .Where(p => ids.Contains(p.Id))
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);
    }

    private static async Task ReloadTrackedAsync<TEntity>(
        InventoryDbContext dbContext, Guid[] ids, Func<TEntity, Guid> idOf, CancellationToken cancellationToken)
        where TEntity : class
    {
        // Only unchanged entries: one with pending changes was already loaded under a lock in this
        // transaction (that is the only way these flows mutate a row), and reloading it would drop them.
        var tracked = dbContext.ChangeTracker.Entries<TEntity>()
            .Where(e => e.State == EntityState.Unchanged && ids.Contains(idOf(e.Entity)))
            .ToList();
        foreach (var entry in tracked)
        {
            await entry.ReloadAsync(cancellationToken).ConfigureAwait(false);
        }
    }
}
