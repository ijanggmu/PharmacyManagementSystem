using System.Data;
using System.Net;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Persistence;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Prescriptions.Data;

/// <summary>
/// Transaction + row-lock discipline for writes to <c>PrescriptionItems</c> (dispensed quantity, fills used).
/// Every writer locks the prescription's item rows (<c>SELECT ... FOR UPDATE</c>) before reading them, so a
/// sale, a direct refill and a reversal against the same prescription serialize instead of each checking
/// "remaining quantity" against the same stale value. <c>PrescriptionItem.RowVersion</c> (xmin) backs this up.
/// </summary>
internal static class PrescriptionWrites
{
    /// <summary>
    /// Runs <paramref name="work"/> transactionally:
    /// <list type="bullet">
    /// <item>this context already has a transaction → just runs (its owner commits);</item>
    /// <item>another context in the scope has one open on the shared connection (the sale's transaction)
    /// → this context joins it for the duration of the work, so the writes commit or roll back with it;</item>
    /// <item>otherwise → opens, and commits, its own READ COMMITTED transaction.</item>
    /// </list>
    /// </summary>
    public static async ValueTask RunInTransactionAsync(
        PrescriptionsDbContext dbContext,
        AmbientDbTransactionRegistry ambientTransactions,
        Func<CancellationToken, ValueTask> work,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(dbContext);
        ArgumentNullException.ThrowIfNull(ambientTransactions);
        ArgumentNullException.ThrowIfNull(work);

        if (!dbContext.Database.IsRelational() || dbContext.Database.CurrentTransaction is not null)
        {
            await work(cancellationToken).ConfigureAwait(false);
            return;
        }

        var ambient = ambientTransactions.Find(dbContext.Database.GetDbConnection());
        if (ambient is not null)
        {
            await dbContext.Database.UseTransactionAsync(ambient, cancellationToken).ConfigureAwait(false);
            try
            {
                await work(cancellationToken).ConfigureAwait(false);
            }
            finally
            {
                // Leave the caller's transaction to its owner; this context must not keep a handle to it.
                await dbContext.Database.UseTransactionAsync(null, CancellationToken.None).ConfigureAwait(false);
            }

            return;
        }

        await using var transaction = await dbContext.Database
            .BeginTransactionAsync(IsolationLevel.ReadCommitted, cancellationToken)
            .ConfigureAwait(false);
        await work(cancellationToken).ConfigureAwait(false);
        await transaction.CommitAsync(cancellationToken).ConfigureAwait(false);
    }

    /// <summary>
    /// Locks every item row of the given prescriptions until the current transaction ends. Only
    /// prescriptions visible to this tenant are locked. Call before loading the items (tracked), so the
    /// loaded values are the post-lock ones. No-op on non-relational providers (InMemory unit tests).
    /// </summary>
    public static async Task LockItemsAsync(
        PrescriptionsDbContext dbContext, IReadOnlyCollection<Guid> prescriptionIds, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(dbContext);
        ArgumentNullException.ThrowIfNull(prescriptionIds);

        if (!dbContext.Database.IsRelational() || prescriptionIds.Count == 0)
        {
            return;
        }

        // Tenant-filtered visibility check first, so the raw lock never touches another tenant's rows.
        var visible = await dbContext.Prescriptions.AsNoTracking()
            .Where(p => prescriptionIds.Contains(p.Id))
            .Select(p => p.Id)
            .ToArrayAsync(cancellationToken)
            .ConfigureAwait(false);
        if (visible.Length == 0)
        {
            return;
        }

        _ = await dbContext.Database.SqlQuery<Guid>($"""
            SELECT "Id" FROM prescriptions."PrescriptionItems"
            WHERE "PrescriptionId" = ANY({visible})
            ORDER BY "Id"
            FOR UPDATE
            """).ToArrayAsync(cancellationToken).ConfigureAwait(false);
    }

    /// <summary>
    /// The 409 a writer throws when its save lost an optimistic-concurrency race on a prescription's rows
    /// (<c>PrescriptionItem.RowVersion</c>) — someone else changed the prescription in the meantime.
    /// </summary>
    public static CustomException Conflict(Guid prescriptionId, Exception inner)
    {
        ArgumentNullException.ThrowIfNull(inner);
        return new CustomException(
            $"Prescription {prescriptionId} was changed by someone else at the same time. Reload it and try again.",
            inner,
            HttpStatusCode.Conflict);
    }
}
