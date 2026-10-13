using Finbuckle.MultiTenant;
using Finbuckle.MultiTenant.Abstractions;
using FSH.Framework.Shared.Constants;
using FSH.Framework.Shared.Multitenancy;
using FSH.Modules.Customers.Contracts.v1.Sms;
using FSH.Modules.Notifications.Contracts.v1.Sms;
using FSH.Modules.Notifications.Data;
using FSH.Modules.Notifications.Domain;
using FSH.Modules.Notifications.Sms;
using FSH.Modules.Prescriptions.Contracts.v1.Reports;
using Hangfire;
using Mediator;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace FSH.Modules.Notifications.Jobs;

/// <summary>
/// Daily at 09:00 Nepal time: per tenant with SMS turned on, queues
/// <list type="bullet">
/// <item><b>automatic dues reminders</b> (when switched on) — one SMS per customer for their invoices overdue by at
/// least <see cref="SmsSettings.DuesReminderDays"/> days that no reminder (automatic or by hand) covered in the last
/// <see cref="SmsSettings.DuesReminderDays"/> days, stating those invoices' amount — so at most one reminder per invoice
/// per N days;</item>
/// <item><b>refill reminders</b> (when switched on) — one SMS per customer whose prescription refills are due (refills
/// left, prescription expiring within <see cref="SmsSettings.RefillReminderDays"/> days), at most once per prescription
/// every <see cref="RefillRepeatDays"/> days.</item>
/// </list>
/// Both go only to active customers who agreed to SMS (<c>SmsConsent</c>) and have a valid Nepali mobile number. The
/// messages are then sent by <see cref="ProcessSmsQueueJob"/> (quiet hours, rate limit, retries). A re-run is harmless:
/// the dedupe sees the messages the first run queued. Hangfire runs this with no tenant: each tenant gets a fresh scope
/// with its Finbuckle context installed (the OperationalAlertsJob pattern); one tenant's failure is logged and skipped.
/// </summary>
public sealed partial class SmsReminderScanJob(
    IServiceScopeFactory scopeFactory,
    IMultiTenantStore<AppTenantInfo> tenantStore,
    TimeProvider timeProvider,
    ILogger<SmsReminderScanJob> logger)
{
    public const string JobId = "notifications-sms-reminders";

    /// <summary>03:15 UTC = 09:00 in Nepal: inside the sending hours, after the pharmacy opens.</summary>
    public const string Cron = "15 3 * * *";

    public const int RefillRepeatDays = 7;

    [AutomaticRetry(Attempts = 1)]
    public async Task RunAsync(CancellationToken cancellationToken)
    {
        var tenants = await tenantStore.GetAllAsync().ConfigureAwait(false);
        int queued = 0;
        foreach (var tenant in tenants)
        {
            if (!tenant.IsActive || string.Equals(tenant.Id, MultitenancyConstants.Root.Id, StringComparison.Ordinal))
            {
                continue;
            }

            cancellationToken.ThrowIfCancellationRequested();
            try
            {
                queued += await ScanTenantAsync(tenant, cancellationToken).ConfigureAwait(false);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                LogTenantFailed(logger, ex, tenant.Id);
            }
        }

        LogFinished(logger, queued);
    }

    private async Task<int> ScanTenantAsync(AppTenantInfo tenant, CancellationToken ct)
    {
        using var scope = scopeFactory.CreateScope();
        scope.ServiceProvider.GetRequiredService<IMultiTenantContextSetter>()
            .MultiTenantContext = new MultiTenantContext<AppTenantInfo>(tenant);

        var composer = scope.ServiceProvider.GetRequiredService<SmsComposer>();
        var settings = await composer.GetSettingsAsync(ct).ConfigureAwait(false);
        if (settings is null || !settings.Enabled || !settings.IsConfigured
            || (!settings.AutoDuesReminders && !settings.AutoRefillReminders))
        {
            return 0;
        }

        var mediator = scope.ServiceProvider.GetRequiredService<IMediator>();
        DateTime now = timeProvider.GetUtcNow().UtcDateTime;
        int queued = 0;

        if (settings.AutoDuesReminders)
        {
            queued += await QueueDuesAsync(mediator, composer, settings, now, ct).ConfigureAwait(false);
        }

        if (settings.AutoRefillReminders)
        {
            queued += await QueueRefillsAsync(mediator, composer, settings, now, ct).ConfigureAwait(false);
        }

        if (queued > 0)
        {
            await scope.ServiceProvider.GetRequiredService<NotificationsDbContext>().SaveChangesAsync(ct).ConfigureAwait(false);
            scope.ServiceProvider.GetRequiredService<SmsDispatchTrigger>().Trigger();
        }

        return queued;
    }

    private static async Task<int> QueueDuesAsync(
        IMediator mediator, SmsComposer composer, SmsSettings settings, DateTime now, CancellationToken ct)
    {
        int days = settings.DuesReminderDays;
        var dues = await mediator.Send(new GetCustomerSmsDuesQuery(now, MinDaysOverdue: days), ct).ConfigureAwait(false);
        int queued = 0;
        foreach (var customer in dues)
        {
            string? phone = Eligible(customer.Contact);
            if (phone is null)
            {
                continue;
            }

            var recent = await composer.RecentAsync(customer.Contact.CustomerId, SmsKinds.DuesReminder, now.AddDays(-days - 1), ct)
                .ConfigureAwait(false);
            var invoices = SmsDedupe.Uncovered(customer.Invoices, i => SmsDedupe.InvoiceKey(i.LedgerEntryId), recent, now, days);
            if (invoices.Count == 0)
            {
                continue;
            }

            // Only the invoices no reminder covered lately: each invoice is reminded at most once per N days.
            await composer.QueueAsync(
                settings, SmsKinds.DuesReminder, SmsTrigger.Automatic, customer.Contact.CustomerId, customer.Contact.Name, phone,
                SmsMessageValues.Dues(customer.Contact.Name, invoices, settings.DefaultLanguage),
                SmsDedupe.Join(invoices.Select(i => SmsDedupe.InvoiceKey(i.LedgerEntryId))),
                requestedBy: null, now, ct).ConfigureAwait(false);
            queued++;
        }

        return queued;
    }

    private static async Task<int> QueueRefillsAsync(
        IMediator mediator, SmsComposer composer, SmsSettings settings, DateTime now, CancellationToken ct)
    {
        var due = await mediator.Send(new GetRefillsDueQuery(settings.RefillReminderDays), ct).ConfigureAwait(false);
        if (due.Count == 0)
        {
            return 0;
        }

        var byCustomer = due
            .Where(r => r.CustomerId != Guid.Empty)
            .GroupBy(r => r.CustomerId)
            .ToDictionary(g => g.Key, g => g.ToList());
        var contacts = await mediator.Send(new GetCustomerSmsContactsQuery(byCustomer.Keys.ToList()), ct).ConfigureAwait(false);

        int queued = 0;
        foreach (var contact in contacts)
        {
            string? phone = Eligible(contact);
            if (phone is null || !byCustomer.TryGetValue(contact.CustomerId, out var refills))
            {
                continue;
            }

            var recent = await composer.RecentAsync(contact.CustomerId, SmsKinds.RefillReminder, now.AddDays(-RefillRepeatDays - 1), ct)
                .ConfigureAwait(false);
            var prescriptions = refills
                .GroupBy(r => r.PrescriptionId)
                .Select(g => (PrescriptionId: g.Key, ExpiryDate: g.Min(r => r.ExpiryDate)))
                .ToList();
            var open = SmsDedupe.Uncovered(prescriptions, p => SmsDedupe.PrescriptionKey(p.PrescriptionId), recent, now, RefillRepeatDays);
            if (open.Count == 0)
            {
                continue;
            }

            await composer.QueueAsync(
                settings, SmsKinds.RefillReminder, SmsTrigger.Automatic, contact.CustomerId, contact.Name, phone,
                SmsMessageValues.Refill(contact.Name, open.Min(p => p.ExpiryDate), settings.DefaultLanguage),
                SmsDedupe.Join(open.Select(p => SmsDedupe.PrescriptionKey(p.PrescriptionId))),
                requestedBy: null, now, ct).ConfigureAwait(false);
            queued++;
        }

        return queued;
    }

    /// <summary>The number to text for an automated reminder: an active customer who agreed to SMS, with a mobile number.</summary>
    public static string? Eligible(CustomerSmsContactDto contact)
    {
        ArgumentNullException.ThrowIfNull(contact);
        return contact.IsActive && contact.SmsConsent ? SmsPhone.Normalize(contact.Phone) : null;
    }

    [LoggerMessage(Level = LogLevel.Error, Message = "SMS reminder scan failed for tenant {TenantId}")]
    private static partial void LogTenantFailed(ILogger logger, Exception exception, string? tenantId);

    [LoggerMessage(Level = LogLevel.Information, Message = "SMS reminder scan queued {Count} reminder(s)")]
    private static partial void LogFinished(ILogger logger, int count);
}
