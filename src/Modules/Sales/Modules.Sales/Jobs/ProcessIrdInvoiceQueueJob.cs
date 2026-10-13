using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Sales.Data;
using FSH.Modules.Sales.Domain;
using FSH.Modules.Sales.Services;
using FSH.Modules.Sales.Services.Ird;
using Hangfire;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace FSH.Modules.Sales.Jobs;

/// <summary>
/// Drains the IRD queue to CBMS: bills to <c>/api/bill</c>, credit notes to <c>/api/billreturn</c>. Runs as a
/// Hangfire recurring job (every 5 minutes, all tenants) and as a fire-and-forget job for one tenant, enqueued the
/// moment a document is queued (<see cref="IrdDocumentEnqueuer"/>) so it reaches CBMS in real time.
///
/// <para><b>Tenant context.</b> A job has no HTTP tenant, and Finbuckle refuses to save a tenant-scoped row without
/// one. So the job first finds which tenants have due work (a cross-tenant, read-only query with
/// <c>IgnoreQueryFilters()</c>), then for each tenant installs that tenant's context (<see cref="IEventTenantScope"/>)
/// and resolves a FRESH <see cref="SalesDbContext"/> in a new DI scope, so every read and save is tenant-filtered.</para>
///
/// <para><b>Claiming.</b> Each item is claimed in its own short transaction with
/// <c>SELECT ... FOR UPDATE SKIP LOCKED</c>, so two job runs (or two app instances) never pick the same item. The
/// claim also takes the sale row lock — the lock <c>CancelSaleCommandHandler</c> takes — so a sale can't be cancelled
/// between "this bill is sendable" and "this item is Processing". The item flips to
/// <see cref="IrdQueueStatus.Processing"/> and the claim commits BEFORE the outbound call.</para>
///
/// <para><b>Order.</b> A credit note is only sent once its bill is synced: until then it is deferred without
/// spending an attempt (for up to <see cref="MaxReturnWait"/>, after which it fails with a message saying to send
/// the bill first). A bill whose sale was cancelled after it was queued is still sent — the invoice was issued — and
/// the cancellation follows as a bill-return.</para>
///
/// <para><b>Request.</b> The queued document is wrapped at dispatch with the tenant's CBMS user, password (decrypted
/// only here, never logged) and seller PAN, <c>isrealtime</c> (sent within <see cref="IrdOptions.RealtimeWindowSeconds"/>
/// of issue) and <c>datetimeClient</c>.</para>
///
/// <para><b>Lease.</b> A Processing item not updated for <see cref="ProcessingLease"/> belongs to a run that crashed
/// mid-dispatch; it is reclaimed as a failed attempt. CBMS answers a re-sent bill with 101 (already exists), which is
/// treated as accepted.</para>
///
/// Backoff schedule: 1, 5, 15, 30, 60 minutes, up to <see cref="MaxAttempts"/> attempts. A failed item can be resent
/// by hand (<c>ResendIrdQueueItemCommand</c>).
/// </summary>
public sealed partial class ProcessIrdInvoiceQueueJob(
    SalesDbContext dbContext,
    IIrdDispatchClient dispatchClient,
    IServiceScopeFactory scopeFactory,
    IEventTenantScope tenantScope,
    IrdSecrets secrets,
    IOptionsMonitor<IrdOptions> options,
    ILogger<ProcessIrdInvoiceQueueJob> logger)
{
    private const int BatchSize = 10;
    private const int MaxAttempts = 5;
    private const string LeaseExpiredError = "The previous dispatch attempt did not finish (lease expired).";

    /// <summary>How long a Processing item may go without an update before it is treated as abandoned.</summary>
    public static readonly TimeSpan ProcessingLease = TimeSpan.FromMinutes(10);

    /// <summary>How long a credit note waits between checks for its bill to reach CBMS.</summary>
    public static readonly TimeSpan ReturnDeferral = TimeSpan.FromMinutes(2);

    /// <summary>How long a credit note may wait for its bill before it fails.</summary>
    public static readonly TimeSpan MaxReturnWait = TimeSpan.FromHours(24);

    // Exponential backoff in minutes: 1, 5, 15, 30, 60.
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
            await RunForTenantAsync(tenantId, cancellationToken).ConfigureAwait(false);
        }
    }

    /// <summary>Drains one tenant's due items now — enqueued right after a document is queued.</summary>
    [AutomaticRetry(Attempts = 0)]
    public async Task RunForTenantAsync(string tenantId, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(tenantId);
        try
        {
            await ProcessTenantAsync(tenantId, cancellationToken).ConfigureAwait(false);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            // One tenant's failure must not starve the others; its items stay due for the next run.
            LogTenantFailed(logger, ex, tenantId);
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
                var settings = await tenantDb.IrdSettings.AsNoTracking().FirstOrDefaultAsync(cancellationToken).ConfigureAwait(false);

                for (int processed = 0; processed < BatchSize; processed++)
                {
                    var claim = await ClaimNextAsync(tenantDb, tenantId, cancellationToken).ConfigureAwait(false);
                    if (claim is null)
                    {
                        return;
                    }

                    if (claim.Value.Dispatch)
                    {
                        await DispatchAndRecordAsync(tenantDb, settings, claim.Value, cancellationToken).ConfigureAwait(false);
                    }
                }
            }
        }
    }

    private readonly record struct Claim(
        Guid ItemId, string PayloadJson, IrdDocumentType DocumentType, DateTime? DocumentDateUtc, bool Dispatch);

    /// <summary>
    /// Claims the oldest due item of the tenant (SKIP LOCKED) and, in the same transaction, settles it without
    /// dispatch when there is nothing to send, defers a credit note whose bill isn't synced yet, reclaims an abandoned
    /// one, or flips it to Processing. Null when the tenant has nothing left to do.
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
            var sale = await db.Sales.Include(s => s.Items).FirstOrDefaultAsync(s => s.Id == item.SaleId, ct).ConfigureAwait(false);
            bool isBill = item.DocumentType == IrdDocumentType.Bill;

            if (item.Status == IrdQueueStatus.Processing)
            {
                // Abandoned by a crashed run: it counts as a failed attempt.
                bool final = item.Attempts >= MaxAttempts;
                item.MarkFailed(LeaseExpiredError, final, final ? null : now);
                if (final)
                {
                    if (isBill && sale is { IsIrdLocked: false })
                    {
                        sale.MarkIrdDispatchFailed(LeaseExpiredError, isFinalAttempt: true);
                    }

                    await db.SaveChangesAsync(ct).ConfigureAwait(false);
                    return Settled(item);
                }
            }

            if (sale is null)
            {
                item.MarkFailed("Sale not found.", isFinal: true, nextAttemptAtUtc: null);
                await db.SaveChangesAsync(ct).ConfigureAwait(false);
                return Settled(item);
            }

            if (isBill && sale.IsIrdLocked)
            {
                // Already synced by another queue item: the sale is IRD-locked and can't be re-marked. Settle.
                item.MarkSent();
                await db.SaveChangesAsync(ct).ConfigureAwait(false);
                return Settled(item);
            }

            if (!isBill && !sale.IsIrdLocked)
            {
                // A credit note goes after its bill.
                if (now - item.CreatedAtUtc < MaxReturnWait)
                {
                    item.Defer(now + ReturnDeferral, $"Waiting for invoice {sale.InvoiceNumber} to be accepted by IRD.");
                }
                else
                {
                    item.MarkFailed(
                        $"Invoice {sale.InvoiceNumber} has not been accepted by IRD. Send the invoice first, then resend this credit note.",
                        isFinal: true, nextAttemptAtUtc: null);
                }

                await db.SaveChangesAsync(ct).ConfigureAwait(false);
                return Settled(item);
            }

            // Queue rows written before payloads were CBMS-shaped are rebuilt from the sale.
            string payload = item.PayloadJson;
            if (isBill && !CbmsPayloadBuilder.IsCbmsDocument(payload, IrdDocumentType.Bill) && sale.InvoiceNumber is not null)
            {
                payload = CbmsPayloadBuilder.Serialize(CbmsPayloadBuilder.ForSale(sale, buyerName: null));
            }

            item.BeginAttempt();
            await db.SaveChangesAsync(ct).ConfigureAwait(false);
            DateTime? issued = item.DocumentDateUtc ?? (isBill ? sale.CreatedAtUtc : item.CreatedAtUtc);
            return new Claim(item.Id, payload, item.DocumentType, issued, Dispatch: true);
        }, cancellationToken);

    private static Claim Settled(IrdInvoiceQueueEntry item) =>
        new(item.Id, item.PayloadJson, item.DocumentType, item.DocumentDateUtc, Dispatch: false);

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
        SalesDbContext db, IrdSettings? settings, Claim claim, CancellationToken cancellationToken)
    {
        var current = options.CurrentValue;
        var sentAt = DateTime.UtcNow;
        bool isRealtime = claim.DocumentDateUtc is { } issued
            && sentAt - issued <= TimeSpan.FromSeconds(Math.Max(0, current.RealtimeWindowSeconds));

        IrdDispatchResult result;
        try
        {
            result = BuildRequest(settings, current, claim, isRealtime, sentAt, out var request) is { } configError
                ? new IrdDispatchResult(false, null, configError, IsPermanentFailure: true)
                : await dispatchClient.SendAsync(request!, cancellationToken).ConfigureAwait(false);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            result = new IrdDispatchResult(false, null, ex.Message, IsPermanentFailure: false);
        }

        await InTransactionAsync(db, async ct =>
        {
            // Re-read under the sale lock: the tracked copies from the claim may be stale.
            db.ChangeTracker.Clear();
            var item = await db.IrdInvoiceQueues.FirstAsync(q => q.Id == claim.ItemId, ct).ConfigureAwait(false);
            await SalesTransaction.LockSaleRowAsync(db, item.SaleId, ct).ConfigureAwait(false);
            var sale = await db.Sales.FirstOrDefaultAsync(s => s.Id == item.SaleId, ct).ConfigureAwait(false);
            bool isBill = item.DocumentType == IrdDocumentType.Bill;

            if (item.Status != IrdQueueStatus.Processing)
            {
                // Reclaimed by another run after this run's lease expired; that run owns the outcome now.
                return true;
            }

            if (result.Success)
            {
                item.MarkSent(result.ResponseCode, isRealtime);
                if (isBill && sale is { IsIrdLocked: false })
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

                item.MarkFailed(error, isFinal, nextAttempt, result.ResponseCode);
                if (isBill && sale is { IsIrdLocked: false })
                {
                    sale.MarkIrdDispatchFailed(error, isFinal);
                }

                LogDispatchFailed(logger, item.Id, item.SaleId, item.DocumentType, item.Attempts, result.ResponseCode, error);
            }

            await db.SaveChangesAsync(ct).ConfigureAwait(false);
            return true;
        }, cancellationToken).ConfigureAwait(false);
    }

    /// <summary>The CBMS request for a claimed item, or why it can't be built (a permanent failure).</summary>
    private string? BuildRequest(
        IrdSettings? settings, IrdOptions current, Claim claim, bool isRealtime, DateTime sentAt, out IrdDispatchRequest? request)
    {
        request = null;
        if (settings is null || !settings.Enabled)
        {
            return "IRD e-billing is turned off for this pharmacy. Turn it on in IRD settings, then resend.";
        }

        if (!settings.IsConfigured)
        {
            return "IRD e-billing is not fully configured: the CBMS username, password and seller PAN are required.";
        }

        string baseUrl = string.IsNullOrWhiteSpace(settings.BaseUrl) ? current.DefaultBaseUrl : settings.BaseUrl;
        string path = claim.DocumentType == IrdDocumentType.Bill ? current.BillPath : current.BillReturnPath;
        if (!TryResolveEndpoint(baseUrl, path, out var endpoint))
        {
            return $"Invalid IRD CBMS URL '{baseUrl}'. Fix the base URL in IRD settings.";
        }

        var credentials = new CbmsCredentials(settings.Username!, secrets.Unprotect(settings.PasswordProtected!), settings.SellerPan!);
        string body = CbmsPayloadBuilder.ComposeRequest(claim.PayloadJson, credentials, isRealtime, sentAt);
        request = new IrdDispatchRequest(endpoint, body, current.TimeoutMs);
        return null;
    }

    /// <summary><c>{base}/{path}</c>, whether or not the base URL ends with a slash or the path starts with one.</summary>
    public static bool TryResolveEndpoint(string baseUrl, string path, out Uri endpoint)
    {
        ArgumentNullException.ThrowIfNull(baseUrl);
        ArgumentNullException.ThrowIfNull(path);
        endpoint = null!;
        if (!Uri.TryCreate(baseUrl.Trim(), UriKind.Absolute, out var baseUri))
        {
            return false;
        }

        var builder = new UriBuilder(baseUri);
        builder.Path = string.Join('/', new[] { builder.Path, path }
            .SelectMany(p => p.Split('/', StringSplitOptions.RemoveEmptyEntries)));
        endpoint = builder.Uri;
        return true;
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

    [LoggerMessage(Level = LogLevel.Error, Message = "IRD queue processing failed for tenant {TenantId}")]
    private static partial void LogTenantFailed(ILogger logger, Exception exception, string tenantId);

    [LoggerMessage(Level = LogLevel.Warning,
        Message = "IRD dispatch failed for queue item {QueueItemId} (sale {SaleId}, {DocumentType}), attempt {Attempts}, code {ResponseCode}: {Error}")]
    private static partial void LogDispatchFailed(
        ILogger logger, Guid queueItemId, Guid saleId, IrdDocumentType documentType, int attempts, string? responseCode, string error);
}
