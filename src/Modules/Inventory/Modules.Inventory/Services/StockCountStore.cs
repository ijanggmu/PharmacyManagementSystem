using FSH.Framework.Core.Exceptions;
using FSH.Modules.Inventory.Data;
using FSH.Modules.Inventory.Domain;
using FSH.Modules.Multitenancy.Contracts;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Inventory.Services;

/// <summary>Shared reads/locks of the stock count handlers.</summary>
internal static class StockCountStore
{
    /// <summary>
    /// Locks the session row (relational providers; call inside a transaction) and returns it tracked with its
    /// committed status, so two people starting / posting the same count serialize and the second sees the
    /// first's result. Throws <see cref="NotFoundException"/> when it does not exist or belongs to a branch the
    /// caller can not see.
    /// </summary>
    public static async Task<StockCountSession> LockSessionAsync(
        InventoryDbContext dbContext, ICurrentBranch currentBranch, Guid sessionId, CancellationToken cancellationToken)
    {
        if (dbContext.Database.IsRelational())
        {
            await dbContext.Database.SqlQuery<Guid>($"""
                SELECT "Id" FROM inventory."StockCountSessions" WHERE "Id" = {sessionId} FOR UPDATE
                """).ToArrayAsync(cancellationToken).ConfigureAwait(false);

            var tracked = dbContext.ChangeTracker.Entries<StockCountSession>().FirstOrDefault(e => e.Entity.Id == sessionId);
            if (tracked is { State: EntityState.Unchanged })
            {
                await tracked.ReloadAsync(cancellationToken).ConfigureAwait(false);
            }
        }

        return await FindSessionAsync(dbContext, currentBranch, sessionId, cancellationToken).ConfigureAwait(false);
    }

    public static async Task<StockCountSession> FindSessionAsync(
        InventoryDbContext dbContext, ICurrentBranch currentBranch, Guid sessionId, CancellationToken cancellationToken)
    {
        string notFound = $"Stock count {sessionId} not found.";
        var session = await dbContext.StockCountSessions
            .FirstOrDefaultAsync(s => s.Id == sessionId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException(notFound);
        await currentBranch.EnsureCanSeeBranchAsync(session.BranchId, notFound, cancellationToken).ConfigureAwait(false);
        return session;
    }

    /// <summary>
    /// Every movement of <paramref name="batchIds"/> recorded after <paramref name="sinceUtc"/>, grouped by lot.
    /// <paramref name="excludeReferenceId"/> drops the movements a count posting wrote itself.
    /// </summary>
    public static async Task<Dictionary<Guid, List<LotMovement>>> LoadMovementsAsync(
        InventoryDbContext dbContext, IReadOnlyCollection<Guid> batchIds, DateTime sinceUtc, Guid? excludeReferenceId,
        CancellationToken cancellationToken)
    {
        if (batchIds.Count == 0)
        {
            return [];
        }

        Guid?[] ids = batchIds.Select(id => (Guid?)id).ToArray();
        var rows = await dbContext.InventoryTransactions.AsNoTracking()
            .Where(t => ids.Contains(t.MedicineBatchId) && t.CreatedAtUtc > sinceUtc
                && (excludeReferenceId == null || t.ReferenceId != excludeReferenceId))
            .Select(t => new { BatchId = t.MedicineBatchId!.Value, t.CreatedAtUtc, t.QuantityDelta })
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        return rows
            .GroupBy(r => r.BatchId)
            .ToDictionary(g => g.Key, g => g.Select(r => new LotMovement(r.BatchId, r.CreatedAtUtc, r.QuantityDelta)).ToList());
    }
}
