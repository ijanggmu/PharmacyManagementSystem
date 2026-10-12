using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Sales.Data;
using FSH.Modules.Sales.Domain;
using FSH.Modules.Sales.Services;
using Hangfire;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace FSH.Modules.Sales.Jobs;

/// <summary>
/// .NET port of the Next.js reference's cron worker (app/api/internal/ird-sync/route.ts →
/// <c>processIrdQueueBatch</c> in lib/api/ird-service.ts), run as a Hangfire recurring job instead of an
/// externally-triggered, shared-secret-protected HTTP route (<c>jobs.md</c>).
///
/// <para><b>Tenant context.</b> A recurring job has no HTTP tenant, and Finbuckle refuses to save a
/// tenant-scoped row without one. So the job first finds which tenants have due work (a cross-tenant,
/// read-only query with <c>IgnoreQueryFilters()</c>), then for each tenant installs that tenant's context
/// (<see cref="IEventTenantScope"/> — the mechanism the outbox dispatcher uses for event handlers) and
/// resolves a FRESH <see cref="SalesDbContext"/> in a new DI scope, so every read and save is tenant-filtered.</para>
///
/// <para><b>Claiming.</b> Each item is claimed in its own short transaction with
/// <c>SELECT ... FOR UPDATE SKIP LOCKED</c>, so two job runs (or two app instances) never pick the same item.
/// The claim also takes the sale row lock — the lock <c>CancelSaleCommandHandler</c> takes — so a sale can't be
/// cancelled between "this sale is sendable" and "this item is Processing" (cancellation is refused once an
/// item is Processing or Sent). The item flips to <see cref="IrdQueueStatus.Processing"/> and the claim commits
/// BEFORE the outbound call, which runs outside any transaction.</para>
///
/// <para><b>Lease.</b> A Processing item not updated for <see cref="ProcessingLease"/> belongs to a run that
/// crashed mid-dispatch. It is reclaimed as a failed attempt (retried on the normal backoff, or failed for good
/// once <see cref="MaxAttempts"/> is reached) instead of staying stuck. IRD may have received the crashed
/// attempt, so a reclaimed item can reach IRD twice under the same invoice number.</para>
///
/// <para><b>Result.</b> Applied in a second transaction that re-reads the item, locks the sale row and re-reads
/// the sale, so a sale synced by another path meanwhile is never re-marked, and an item reclaimed by another run
/// after this run's lease expired is left to that run.</para>
///
/// Backoff schedule as upstream: 1, 5, 15, 30, 60 minutes, up to <see cref="MaxAttempts"/> attempts.
/// </summary>
public sealed class ProcessIrdInvoiceQueueJob(
    SalesDbContext dbContext,
    IIrdDispatchClient dispatchClient,
    IServiceScopeFactory scopeFactory,
    IEventTenantScope tenantScope,
    ILogger<ProcessIrdInvoiceQueueJob> logger)
{
    private const int BatchSize = 10;
    private const int MaxAttempts = 5;
    private const string LeaseExpiredError = "The previous dispatch attempt did not finish (lease expired).";

    /// <summary>How long a Processing item may go without an update before it is treated as abandoned.</summary>
    public static readonly TimeSpan ProcessingLease = TimeSpan.FromMinutes(10);

    // Exponential backoff in minutes: 1, 5, 15, 30, 60 — same schedule as the Next.js reference's
    // computeNextAttemptAt (lib/api/ird-service.ts).
    private static readonly int[] BackoffMinutes = [1, 5, 15, 30, 60];

    [AutomaticRetry(Attempts = 0)]
    public async Task RunAsync(CancellationToken cancellationToken)
    {
        var now = DateTime.UtcNow;
        var leaseCutoff = now - ProcessingLease;

        // Cross-tenant discovery only (nothing is saved on this tenant-less context).
        var tenantIds = await dbContext.IrdInvoiceQueues.IgnoreQueryFilters()
            .Where(q => (q.Status == IrdQueueStatus.Pending && (q.NextAttemptAtUtc == null || q.NextAttemptAtUtc <= now))
                || (q.Status == IrdQueueStatus.Processing && q.UpdatedAtUtc < leaseCutoff))
            .Select(q => EF.Property<string>(q, "TenantId"))
            .Distinct()
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        foreach (string tenantId in tenantIds)
        {
            try
            {
                await ProcessTenantAsync(tenantId, cancellationToken).ConfigureAwait(false);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                // One tenant's failure must not starve the others; its items stay due for the next run.
                logger.LogError(ex, "IRD queue processing failed for tenant {TenantId}", tenantId);
            }
        }
    }

    private async Task ProcessTenantAsync(string tenantId, CancellationToken cancellationToken)
    {
        // The tenant context must be in place BEFORE the DbContext is constructed (it captures TenantInfo).
        using (tenantScope.Begin(tenantId))
        {
            var scope = scopeFactory.CreateAsyncScope();
            await using (scope.ConfigureAwait(false))
            {
                var tenantDb = scope.ServiceProvider.GetRequiredService<SalesDbContext>();

                for (int processed = 0; processed < BatchSize; processed++)
                {
                    var claim = await ClaimNextAsync(tenantDb, tenantId, cancellationToken).ConfigureAwait(false);
                    if (claim is null)
                    {
                        return;
                    }

                    if (claim.Value.Dispatch)
                    {
                        await DispatchAndRecordAsync(tenantDb, tenantId, claim.Value.ItemId, claim.Value.PayloadJson, cancellationToken)
                            .ConfigureAwait(false);
                    }
                }
            }
        }
    }

    private readonly record struct Claim(Guid ItemId, string PayloadJson, bool Dispatch);

    /// <summary>
    /// Claims the oldest due item of the tenant (SKIP LOCKED) and, in the same transaction, settles it without
    /// dispatch when there is nothing to send, reclaims an abandoned one, or flips it to Processing. Null when
    /// the tenant has nothing left to do.
    /// </summary>
    private static Task<Claim?> ClaimNextAsync(SalesDbContext db, string tenantId, CancellationToken cancellationToken) =>
        InTransactionAsync<Claim?>(db, async ct =>
        {
            db.ChangeTracker.Clear();
            var now = DateTime.UtcNow;

            Guid? itemId = await NextDueItemIdAsync(db, tenantId, now, now - ProcessingLease, ct).ConfigureAwait(false);
            if (itemId is null)
            {
                return null;
            }

            var item = await db.IrdInvoiceQueues.FirstAsync(q => q.Id == itemId.Value, ct).ConfigureAwait(false);

            // Same lock CancelSaleCommandHandler takes: the sale can't be cancelled while it is being claimed.
            await SalesTransaction.LockSaleRowAsync(db, item.SaleId, ct).ConfigureAwait(false);
            var sale = await db.Sales.FirstOrDefaultAsync(s => s.Id == item.SaleId, ct).ConfigureAwait(false);

            if (item.Status == IrdQueueStatus.Processing)
            {
                // Abandoned by a crashed run: it counts as a failed attempt.
                bool final = item.Attempts >= MaxAttempts;
                item.MarkFailed(LeaseExpiredError, final, final ? null : now);
                if (final)
                {
                    if (sale is { IsIrdLocked: false })
                    {
                        sale.MarkIrdDispatchFailed(LeaseExpiredError, isFinalAttempt: true);
                    }

                    await db.SaveChangesAsync(ct).ConfigureAwait(false);
                    return new Claim(item.Id, item.PayloadJson, Dispatch: false);
                }
            }

            // Nothing to send: the sale was already synced by another queue item (it is IRD-locked and can't be
            // re-marked), or it was cancelled after being queued. Settle the item instead of dispatching.
            if (sale is { IsIrdLocked: true })
            {
                item.MarkSent();
                await db.SaveChangesAsync(ct).ConfigureAwait(false);
                return new Claim(item.Id, item.PayloadJson, Dispatch: false);
            }

            if (sale is null || sale.Status == SaleStatus.Cancelled)
            {
                item.MarkFailed(sale is null ? "Sale not found." : "Sale was cancelled before it was sent.", isFinal: true, nextAttemptAtUtc: null);
                await db.SaveChangesAsync(ct).ConfigureAwait(false);
                return new Claim(item.Id, item.PayloadJson, Dispatch: false);
            }

            item.BeginAttempt();
            await db.SaveChangesAsync(ct).ConfigureAwait(false);
            return new Claim(item.Id, item.PayloadJson, Dispatch: true);
        }, cancellationToken);

    private static async Task<Guid?> NextDueItemIdAsync(
        SalesDbContext db, string tenantId, DateTime now, DateTime leaseCutoff, CancellationToken ct)
    {
        if (!db.Database.IsRelational())
        {
            // InMemory (unit tests): no row locks; the tenant query filter scopes the read.
            var id = await db.IrdInvoiceQueues
                .Where(q => (q.Status == IrdQueueStatus.Pending && (q.NextAttemptAtUtc == null || q.NextAttemptAtUtc <= now))
                    || (q.Status == IrdQueueStatus.Processing && q.UpdatedAtUtc < leaseCutoff))
                .OrderBy(q => q.CreatedAtUtc)
                .Select(q => q.Id)
                .FirstOrDefaultAsync(ct)
                .ConfigureAwait(false);
            return id == Guid.Empty ? null : id;
        }

        // Raw SQL bypasses the tenant query filter, so the tenant is matched explicitly.
        string pending = nameof(IrdQueueStatus.Pending);
        string processing = nameof(IrdQueueStatus.Processing);
        var ids = await db.Database.SqlQuery<Guid>($"""
            SELECT "Id" AS "Value" FROM sales."IrdInvoiceQueues"
            WHERE "TenantId" = {tenantId}
              AND (("Status" = {pending} AND ("NextAttemptAtUtc" IS NULL OR "NextAttemptAtUtc" <= {now}))
                OR ("Status" = {processing} AND "UpdatedAtUtc" < {leaseCutoff}))
            ORDER BY "CreatedAtUtc"
            LIMIT 1
            FOR UPDATE SKIP LOCKED
            """).ToListAsync(ct).ConfigureAwait(false);
        return ids.Count == 0 ? null : ids[0];
    }

    private async Task DispatchAndRecordAsync(
        SalesDbContext db, string tenantId, Guid itemId, string payloadJson, CancellationToken cancellationToken)
    {
        IrdDispatchResult result;
        try
        {
            result = await dispatchClient.SendInvoiceAsync(tenantId, payloadJson, cancellationToken).ConfigureAwait(false);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            result = new IrdDispatchResult(false, null, ex.Message, IsPermanentFailure: false);
        }

        await InTransactionAsync(db, async ct =>
        {
            // Re-read under the sale lock: the tracked copies from the claim may be stale.
            db.ChangeTracker.Clear();
            var item = await db.IrdInvoiceQueues.FirstAsync(q => q.Id == itemId, ct).ConfigureAwait(false);
            await SalesTransaction.LockSaleRowAsync(db, item.SaleId, ct).ConfigureAwait(false);
            var sale = await db.Sales.FirstOrDefaultAsync(s => s.Id == item.SaleId, ct).ConfigureAwait(false);

            if (item.Status != IrdQueueStatus.Processing)
            {
                // Reclaimed by another run after this run's lease expired; that run owns the outcome now.
                return true;
            }

            if (result.Success)
            {
                item.MarkSent();
                if (sale is { IsIrdLocked: false })
                {
                    sale.MarkIrdSynced(result.ExternalInvoiceId);
                }
            }
            else
            {
                string error = result.ErrorMessage ?? "Unknown IRD dispatch error";
                bool isFinal = result.IsPermanentFailure || item.Attempts >= MaxAttempts;
                DateTime? nextAttempt = isFinal
                    ? null
                    : DateTime.UtcNow.AddMinutes(BackoffMinutes[Math.Min(item.Attempts - 1, BackoffMinutes.Length - 1)]);

                item.MarkFailed(error, isFinal, nextAttempt);
                if (sale is { IsIrdLocked: false })
                {
                    sale.MarkIrdDispatchFailed(error, isFinal);
                }

                logger.LogWarning(
                    "IRD dispatch failed for queue item {QueueItemId} (sale {SaleId}), attempt {Attempts}: {Error}",
                    item.Id, item.SaleId, item.Attempts, error);
            }

            await db.SaveChangesAsync(ct).ConfigureAwait(false);
            return true;
        }, cancellationToken).ConfigureAwait(false);
    }

    private static async Task<T> InTransactionAsync<T>(SalesDbContext db, Func<CancellationToken, Task<T>> work, CancellationToken ct)
    {
        if (!db.Database.IsRelational())
        {
            return await work(ct).ConfigureAwait(false);
        }

        var transaction = await db.Database.BeginTransactionAsync(ct).ConfigureAwait(false);
        await using (transaction.ConfigureAwait(false))
        {
            T result = await work(ct).ConfigureAwait(false);
            await transaction.CommitAsync(ct).ConfigureAwait(false);
            return result;
        }
    }
}
