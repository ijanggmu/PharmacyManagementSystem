using FSH.Modules.Sales.Data;
using FSH.Modules.Sales.Domain;
using FSH.Modules.Sales.Services;
using Hangfire;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace FSH.Modules.Sales.Jobs;

/// <summary>
/// .NET port of the Next.js reference's cron worker (app/api/internal/ird-sync/route.ts →
/// <c>processIrdQueueBatch</c> in lib/api/ird-service.ts), run as a Hangfire recurring job instead of an
/// externally-triggered, shared-secret-protected HTTP route (<c>jobs.md</c> — fire-and-forget/scheduled
/// work goes through Hangfire in this kit, not a bespoke cron endpoint).
///
/// Claims a batch of due <c>Pending</c> <see cref="IrdInvoiceQueueEntry"/> rows, dispatches each via
/// <see cref="IIrdDispatchClient"/>, and applies the same exponential backoff schedule as upstream
/// (1, 5, 15, 30, 60 minutes) up to <see cref="MaxAttempts"/> attempts before giving up permanently.
///
/// Uses <c>IgnoreQueryFilters()</c> the same way <c>PurgeOrphanedFilesJob</c> (Files module) does,
/// rather than the full per-tenant-database fan-out described in <c>eventing.md</c>'s
/// <c>IEventingDrainTargetProvider</c> pattern — this processes the job's own (default) tenant
/// connection, matching the existing precedent for a simple recurring purge/drain job in this codebase.
/// A tenant on its own dedicated database would need this job re-run per tenant target, out of scope
/// here.
/// </summary>
public sealed class ProcessIrdInvoiceQueueJob(
    SalesDbContext dbContext,
    IIrdDispatchClient dispatchClient,
    ILogger<ProcessIrdInvoiceQueueJob> logger)
{
    private const int BatchSize = 10;
    private const int MaxAttempts = 5;

    // Exponential backoff in minutes: 1, 5, 15, 30, 60 — same schedule as the Next.js reference's
    // computeNextAttemptAt (lib/api/ird-service.ts).
    private static readonly int[] BackoffMinutes = [1, 5, 15, 30, 60];

    [AutomaticRetry(Attempts = 0)]
    public async Task RunAsync(CancellationToken cancellationToken)
    {
        var now = DateTime.UtcNow;

        var due = await dbContext.IrdInvoiceQueues.IgnoreQueryFilters()
            .Where(q => q.Status == IrdQueueStatus.Pending
                && (q.NextAttemptAtUtc == null || q.NextAttemptAtUtc <= now))
            .OrderBy(q => q.CreatedAtUtc)
            .Take(BatchSize)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        if (due.Count == 0)
        {
            return;
        }

        foreach (var item in due)
        {
            await ProcessOneAsync(item, cancellationToken).ConfigureAwait(false);
        }
    }

    private async Task ProcessOneAsync(IrdInvoiceQueueEntry item, CancellationToken cancellationToken)
    {
        var sale = await dbContext.Sales.IgnoreQueryFilters()
            .FirstOrDefaultAsync(s => s.Id == item.SaleId, cancellationToken)
            .ConfigureAwait(false);

        // Nothing to send: the sale was already synced by another queue item (it is IRD-locked and can't be
        // re-marked), or it was cancelled after being queued. Settle the item instead of dispatching, so it
        // doesn't sit in the queue or report a duplicate invoice.
        if (sale is { IsIrdLocked: true })
        {
            item.MarkSent();
            await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
            return;
        }

        if (sale is null || sale.Status == SaleStatus.Cancelled)
        {
            item.MarkFailed(sale is null ? "Sale not found." : "Sale was cancelled before it was sent.", isFinal: true, nextAttemptAtUtc: null);
            await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
            return;
        }

        item.BeginAttempt();
        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        // Tenant is a Finbuckle shadow property on every tenant-scoped row. The job runs without an HTTP
        // tenant context, so the queue row is the only source of which tenant's IRD config to use.
        string tenantId = dbContext.Entry(item).Property("TenantId").CurrentValue as string ?? string.Empty;

        IrdDispatchResult result;
        try
        {
            result = await dispatchClient.SendInvoiceAsync(tenantId, item.PayloadJson, cancellationToken).ConfigureAwait(false);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            result = new IrdDispatchResult(false, null, ex.Message, IsPermanentFailure: false);
        }

        if (result.Success)
        {
            item.MarkSent();
            if (!sale.IsIrdLocked)
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
            if (!sale.IsIrdLocked)
            {
                sale.MarkIrdDispatchFailed(error, isFinal);
            }

            logger.LogWarning(
                "IRD dispatch failed for queue item {QueueItemId} (sale {SaleId}), attempt {Attempts}: {Error}",
                item.Id, item.SaleId, item.Attempts, error);
        }

        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
    }
}
