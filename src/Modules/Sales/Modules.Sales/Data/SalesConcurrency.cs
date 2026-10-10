using System.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using Npgsql;

namespace FSH.Modules.Sales.Data;

/// <summary>
/// Runs a sales write as one READ COMMITTED transaction on the Sales context, retrying it once on a
/// Postgres serialization failure (40001) or deadlock (40P01). The transaction also carries the
/// Inventory deduction (it joins this transaction via the shared scope connection) and the outbox row,
/// so the sale, its stock movements and its event commit or roll back together.
/// </summary>
internal static class SalesTransaction
{
    private const string SerializationFailure = "40001";
    private const string DeadlockDetected = "40P01";

    public static async ValueTask<T> ExecuteAsync<T>(
        SalesDbContext dbContext,
        Func<CancellationToken, ValueTask<T>> work,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(dbContext);
        ArgumentNullException.ThrowIfNull(work);

        // Non-relational providers (InMemory unit tests) have no transactions. A caller that already
        // opened one owns its boundaries, so there is nothing to retry here.
        if (!dbContext.Database.IsRelational() || dbContext.Database.CurrentTransaction is not null)
        {
            return await work(cancellationToken).ConfigureAwait(false);
        }

        try
        {
            return await RunOnceAsync(dbContext, work, cancellationToken).ConfigureAwait(false);
        }
        catch (Exception ex) when (IsTransientConflict(ex))
        {
            // The failed attempt has already rolled back (its transaction was disposed before this
            // catch runs). Forget its tracked entities so the retry starts from database state.
            dbContext.ChangeTracker.Clear();
            return await RunOnceAsync(dbContext, work, cancellationToken).ConfigureAwait(false);
        }
    }

    /// <summary>
    /// Locks a sale's row (<c>SELECT ... FOR UPDATE</c>) for the rest of the caller's transaction.
    /// Returns/refunds call this first so concurrent writes against the same sale serialize, and the
    /// "already returned/refunded" sums that follow read the committed state of the other writer.
    /// A sale that is not visible to this tenant is not locked; the caller's tracked load then raises NotFound.
    /// </summary>
    public static async Task LockSaleRowAsync(SalesDbContext dbContext, Guid saleId, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(dbContext);

        if (!dbContext.Database.IsRelational())
        {
            return;
        }

        // Tenant-filtered existence check first, so the raw lock never touches another tenant's row.
        bool visible = await dbContext.Sales.AsNoTracking()
            .AnyAsync(s => s.Id == saleId, cancellationToken)
            .ConfigureAwait(false);
        if (!visible)
        {
            return;
        }

        _ = await dbContext.Database.SqlQuery<Guid>($"""
            SELECT "Id" FROM sales."Sales" WHERE "Id" = {saleId} FOR UPDATE
            """).ToArrayAsync(cancellationToken).ConfigureAwait(false);
    }

    private static async ValueTask<T> RunOnceAsync<T>(
        SalesDbContext dbContext,
        Func<CancellationToken, ValueTask<T>> work,
        CancellationToken cancellationToken)
    {
        // Every context in the scope shares this connection, so the Inventory deduction and the outbox
        // row run inside this transaction (Npgsql runs commands inside the connection's current
        // transaction). Disposing without a commit rolls back.
        await using IDbContextTransaction transaction = await dbContext.Database
            .BeginTransactionAsync(IsolationLevel.ReadCommitted, cancellationToken)
            .ConfigureAwait(false);

        var result = await work(cancellationToken).ConfigureAwait(false);
        await transaction.CommitAsync(cancellationToken).ConfigureAwait(false);
        return result;
    }

    internal static bool IsTransientConflict(Exception exception)
    {
        for (Exception? current = exception; current is not null; current = current.InnerException)
        {
            if (current is PostgresException { SqlState: SerializationFailure or DeadlockDetected })
            {
                return true;
            }
        }

        return false;
    }
}
