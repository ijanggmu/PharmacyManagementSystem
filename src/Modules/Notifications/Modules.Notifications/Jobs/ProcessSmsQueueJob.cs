using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Notifications.Contracts.v1.Sms;
using FSH.Modules.Notifications.Data;
using FSH.Modules.Notifications.Domain;
using FSH.Modules.Notifications.Sms;
using FSH.Modules.Notifications.Sms.Providers;
using Hangfire;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace FSH.Modules.Notifications.Jobs;

/// <summary>
/// Sends queued SMS through each tenant's gateway. Runs every minute for all tenants and as a fire-and-forget job for one
/// tenant the moment something is queued (<see cref="SmsDispatchTrigger"/>). The IRD queue's pattern
/// (<c>ProcessIrdInvoiceQueueJob</c>): cross-tenant discovery only, then each tenant in its own tenant context and DI
/// scope; each message claimed with <c>FOR UPDATE SKIP LOCKED</c> and flipped to Sending before the gateway call, so two
/// runs never send the same message.
///
/// <para><b>Quiet hours.</b> A reminder claimed during the tenant's quiet hours (Nepal time, default 21:00-07:00) is
/// put back until they end without spending an attempt. Receipts and test messages go out at any hour.</para>
/// <para><b>Rate limit.</b> At most <see cref="SmsSettings.MaxPerHour"/> gateway calls per tenant in any hour; the rest
/// stay queued for a later run. Receipts are claimed first.</para>
/// <para><b>Retries.</b> A transient failure (timeout, HTTP 5xx / 429) is retried after 1, 5, 15, 30 then 60 minutes, up
/// to <see cref="MaxAttempts"/> attempts; a permanent one (bad token, invalid number, no credit) fails at once. A failed
/// message can be retried from the SMS log. A message left Sending longer than <see cref="SendingLease"/> belongs to a
/// run that crashed and is reclaimed as a failed attempt (the gateway may already have sent it).</para>
/// </summary>
public sealed partial class ProcessSmsQueueJob(
    NotificationsDbContext dbContext,
    IServiceScopeFactory scopeFactory,
    IEventTenantScope tenantScope,
    SmsSecrets secrets,
    SmsProviderResolver providers,
    TimeProvider timeProvider,
    ILogger<ProcessSmsQueueJob> logger)
{
    public const string JobId = "notifications-process-sms-queue";
    public const int MaxAttempts = 5;
    private const int BatchSize = 50;

    public static readonly TimeSpan SendingLease = TimeSpan.FromMinutes(10);
    private static readonly int[] BackoffMinutes = [1, 5, 15, 30, 60];

    [AutomaticRetry(Attempts = 0)]
    public async Task RunAsync(CancellationToken cancellationToken)
    {
        DateTime now = timeProvider.GetUtcNow().UtcDateTime;
        DateTime leaseCutoff = now - SendingLease;

        // Cross-tenant discovery only (nothing is saved on this tenant-less context).
        var tenantIds = await dbContext.SmsMessages.IgnoreQueryFilters()
            .Where(m => (m.Status == SmsStatus.Queued && (m.NextAttemptAtUtc == null || m.NextAttemptAtUtc <= now))
                || (m.Status == SmsStatus.Sending && m.UpdatedAtUtc < leaseCutoff))
            .Select(m => EF.Property<string>(m, "TenantId"))
            .Distinct()
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        foreach (string tenantId in tenantIds)
        {
            await RunForTenantAsync(tenantId, cancellationToken).ConfigureAwait(false);
        }
    }

    [AutomaticRetry(Attempts = 0)]
    public async Task RunForTenantAsync(string tenantId, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(tenantId);
        try
        {
            using (tenantScope.Begin(tenantId))
            {
                var scope = scopeFactory.CreateAsyncScope();
                await using (scope.ConfigureAwait(false))
                {
                    var db = scope.ServiceProvider.GetRequiredService<NotificationsDbContext>();
                    await ProcessTenantAsync(db, tenantId, cancellationToken).ConfigureAwait(false);
                }
            }
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            // One tenant's failure must not starve the others; its messages stay due for the next run.
            LogTenantFailed(logger, ex, tenantId);
        }
    }

    private async Task ProcessTenantAsync(NotificationsDbContext db, string tenantId, CancellationToken ct)
    {
        var settings = await db.SmsSettings.AsNoTracking().FirstOrDefaultAsync(ct).ConfigureAwait(false);
        DateTime now = timeProvider.GetUtcNow().UtcDateTime;
        int maxPerHour = settings?.MaxPerHour ?? SmsSettings.DefaultMaxPerHour;
        int usedThisHour = await db.SmsMessages
            .CountAsync(m => m.LastAttemptAtUtc != null && m.LastAttemptAtUtc > now.AddHours(-1), ct)
            .ConfigureAwait(false);
        int budget = Math.Min(BatchSize, maxPerHour - usedThisHour);

        while (budget > 0)
        {
            var claim = await ClaimNextAsync(db, tenantId, settings, ct).ConfigureAwait(false);
            if (claim is null)
            {
                return;
            }

            if (claim.Value.Send)
            {
                budget--;
                await SendAndRecordAsync(db, settings!, claim.Value, ct).ConfigureAwait(false);
            }
        }

        if (budget <= 0)
        {
            LogRateLimited(logger, maxPerHour);
        }
    }

    private readonly record struct Claim(Guid Id, string Phone, string Body, bool Send);

    /// <summary>Claims the next due message and either settles it here (quiet hours, SMS turned off, lease expired for
    /// good) or flips it to Sending. Null when nothing is due.</summary>
    private Task<Claim?> ClaimNextAsync(NotificationsDbContext db, string tenantId, SmsSettings? settings, CancellationToken cancellationToken) =>
        InTransactionAsync<Claim?>(db, async ct =>
        {
            db.ChangeTracker.Clear();
            DateTime now = timeProvider.GetUtcNow().UtcDateTime;
            Guid? id = await NextDueIdAsync(db, tenantId, now, ct).ConfigureAwait(false);
            if (id is null)
            {
                return null;
            }

            var message = await db.SmsMessages.FirstAsync(m => m.Id == id.Value, ct).ConfigureAwait(false);
            var settled = new Claim(message.Id, message.Phone, message.Body, Send: false);

            if (message.Status == SmsStatus.Sending)
            {
                bool final = message.Attempts >= MaxAttempts;
                message.MarkFailed("The previous send attempt did not finish (lease expired).", final,
                    final ? null : now, null, null, now);
                await db.SaveChangesAsync(ct).ConfigureAwait(false);
                if (final)
                {
                    return settled;
                }
            }

            string? blocked = BlockReason(settings, message.Kind);
            if (blocked is not null)
            {
                message.MarkFailed(blocked, isFinal: true, null, null, null, now);
                await db.SaveChangesAsync(ct).ConfigureAwait(false);
                return settled;
            }

            if (!message.IgnoresQuietHours && SmsQuietHours.IsQuiet(now, settings!.QuietHoursStart, settings.QuietHoursEnd))
            {
                message.Defer(SmsQuietHours.NextAllowedUtc(now, settings.QuietHoursStart, settings.QuietHoursEnd),
                    "Held for quiet hours.", now);
                await db.SaveChangesAsync(ct).ConfigureAwait(false);
                return settled;
            }

            message.BeginAttempt(now);
            await db.SaveChangesAsync(ct).ConfigureAwait(false);
            return settled with { Send = true };
        }, cancellationToken);

    /// <summary>Why a message cannot be sent with these settings at all (a permanent failure), or null.</summary>
    public static string? BlockReason(SmsSettings? settings, string kind)
    {
        if (settings is null)
        {
            return "SMS is not set up for this pharmacy.";
        }

        if (!settings.Enabled && kind != SmsKinds.Test)
        {
            return "SMS is turned off for this pharmacy. Turn it on in SMS settings, then retry.";
        }

        return settings.IsConfigured
            ? null
            : "SMS is not fully configured: the gateway token (and, for Sparrow, the sender ID) is required.";
    }

    private static async Task<Guid?> NextDueIdAsync(NotificationsDbContext db, string tenantId, DateTime now, CancellationToken ct)
    {
        DateTime leaseCutoff = now - SendingLease;
        if (!db.Database.IsRelational())
        {
            // InMemory (unit tests): no row locks; the tenant query filter scopes the read.
            var id = await db.SmsMessages
                .Where(m => (m.Status == SmsStatus.Queued && (m.NextAttemptAtUtc == null || m.NextAttemptAtUtc <= now))
                    || (m.Status == SmsStatus.Sending && m.UpdatedAtUtc < leaseCutoff))
                .OrderByDescending(m => m.IgnoresQuietHours)
                .ThenBy(m => m.CreatedAtUtc)
                .Select(m => m.Id)
                .FirstOrDefaultAsync(ct)
                .ConfigureAwait(false);
            return id == Guid.Empty ? null : id;
        }

        // Raw SQL bypasses the tenant query filter, so the tenant is matched explicitly.
        string queued = nameof(SmsStatus.Queued);
        string sending = nameof(SmsStatus.Sending);
        var ids = await db.Database.SqlQuery<Guid>($"""
            SELECT "Id" AS "Value" FROM notifications."SmsMessages"
            WHERE "TenantId" = {tenantId}
              AND (("Status" = {queued} AND ("NextAttemptAtUtc" IS NULL OR "NextAttemptAtUtc" <= {now}))
                OR ("Status" = {sending} AND "UpdatedAtUtc" < {leaseCutoff}))
            ORDER BY "IgnoresQuietHours" DESC, "CreatedAtUtc"
            LIMIT 1
            FOR UPDATE SKIP LOCKED
            """).ToListAsync(ct).ConfigureAwait(false);
        return ids.Count == 0 ? null : ids[0];
    }

    private async Task SendAndRecordAsync(NotificationsDbContext db, SmsSettings settings, Claim claim, CancellationToken cancellationToken)
    {
        SmsSendResult result;
        var provider = providers.Get(settings.Provider);
        if (provider is null)
        {
            result = SmsSendResult.Permanent($"Unknown SMS provider '{settings.Provider}'.");
        }
        else
        {
            try
            {
                string? token = settings.ApiTokenProtected is null ? null : secrets.Unprotect(settings.ApiTokenProtected);
                result = await provider.SendAsync(new SmsSendRequest(claim.Phone, claim.Body, settings.SenderId, token), cancellationToken)
                    .ConfigureAwait(false);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                // e.g. a token that no longer decrypts (key ring rotated away): fix the settings, then retry.
                LogSendError(logger, ex, claim.Id);
                result = SmsSendResult.Transient($"Sending failed: {ex.GetType().Name}.");
            }
        }

        await InTransactionAsync(db, async ct =>
        {
            db.ChangeTracker.Clear();
            DateTime now = timeProvider.GetUtcNow().UtcDateTime;
            var message = await db.SmsMessages.FirstAsync(m => m.Id == claim.Id, ct).ConfigureAwait(false);
            if (message.Status != SmsStatus.Sending)
            {
                // Reclaimed by another run after this run's lease expired; that run owns the outcome now.
                return true;
            }

            if (result.Success)
            {
                message.MarkSent(result.ResponseCode, result.ResponseMessage, result.ProviderMessageId, result.Credits, now);
            }
            else
            {
                bool final = result.IsPermanentFailure || message.Attempts >= MaxAttempts;
                DateTime? next = final ? null : now.AddMinutes(BackoffMinutes[Math.Min(message.Attempts - 1, BackoffMinutes.Length - 1)]);
                string error = result.Error ?? "Unknown SMS gateway error.";
                message.MarkFailed(error, final, next, result.ResponseCode, result.ResponseMessage, now);
                LogSendFailed(logger, message.Id, message.Provider, message.Attempts, result.ResponseCode, SmsPhone.Mask(message.Phone));
            }

            await db.SaveChangesAsync(ct).ConfigureAwait(false);
            return true;
        }, cancellationToken).ConfigureAwait(false);
    }

    private static async Task<T> InTransactionAsync<T>(NotificationsDbContext db, Func<CancellationToken, Task<T>> work, CancellationToken ct)
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

    [LoggerMessage(Level = LogLevel.Error, Message = "SMS queue processing failed for tenant {TenantId}")]
    private static partial void LogTenantFailed(ILogger logger, Exception exception, string tenantId);

    [LoggerMessage(Level = LogLevel.Information, Message = "SMS rate limit reached ({MaxPerHour} per hour); the rest stay queued")]
    private static partial void LogRateLimited(ILogger logger, int maxPerHour);

    [LoggerMessage(Level = LogLevel.Warning, Message = "SMS {SmsId} could not be handed to the gateway")]
    private static partial void LogSendError(ILogger logger, Exception exception, Guid smsId);

    [LoggerMessage(Level = LogLevel.Warning,
        Message = "SMS {SmsId} via {Provider} failed on attempt {Attempts} (code {ResponseCode}) to {Phone}")]
    private static partial void LogSendFailed(ILogger logger, Guid smsId, string provider, int attempts, string? responseCode, string phone);
}
