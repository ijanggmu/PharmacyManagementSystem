using Finbuckle.MultiTenant.Abstractions;
using FSH.Framework.Jobs.Services;
using FSH.Framework.Shared.Multitenancy;
using FSH.Modules.Customers.Contracts.v1.Sms;
using FSH.Modules.Notifications.Contracts.v1.Sms;
using FSH.Modules.Notifications.Data;
using FSH.Modules.Notifications.Domain;
using FSH.Modules.Notifications.Jobs;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace FSH.Modules.Notifications.Sms;

/// <summary>Encrypts the SMS gateway token at rest (Data Protection, the IRD / Fonepay approach). The plain token only
/// exists in memory while a gateway request is built; it is never logged or returned.</summary>
public sealed class SmsSecrets(IDataProtectionProvider dataProtectionProvider)
{
    private const string Purpose = "FSH.Notifications.SmsSettings.v1";
    private readonly IDataProtector _protector = dataProtectionProvider.CreateProtector(Purpose);

    /// <summary>Null for an empty value, so the caller keeps what is stored.</summary>
    public string? ProtectOrKeep(string? plainText) =>
        string.IsNullOrWhiteSpace(plainText) ? null : _protector.Protect(plainText.Trim());

    public string Unprotect(string protectedValue) => _protector.Unprotect(protectedValue);
}

/// <summary>
/// Builds and queues SMS for the tenant in context: reads its settings and templates, fills the template and adds the
/// <see cref="SmsMessage"/> to the context (the caller saves). Used by the reminder button, the daily scan and the
/// receipt handler, so every path renders the same way.
/// </summary>
public sealed class SmsComposer(NotificationsDbContext db, IMultiTenantContextAccessor<AppTenantInfo> tenantAccessor)
{
    public Task<SmsSettings?> GetSettingsAsync(CancellationToken cancellationToken) =>
        db.SmsSettings.AsNoTracking().FirstOrDefaultAsync(cancellationToken);

    public async Task<string> TemplateAsync(string kind, string language, CancellationToken cancellationToken)
    {
        string? body = await db.SmsTemplates.AsNoTracking()
            .Where(t => t.Kind == kind && t.Language == language)
            .Select(t => t.Body)
            .FirstOrDefaultAsync(cancellationToken)
            .ConfigureAwait(false);
        return string.IsNullOrWhiteSpace(body) ? SmsTemplates.Default(kind, language) : body;
    }

    /// <summary>The name {pharmacy} shows: the configured one, else the tenant's name.</summary>
    public string PharmacyName(SmsSettings settings)
    {
        ArgumentNullException.ThrowIfNull(settings);
        return settings.PharmacyName
            ?? tenantAccessor.MultiTenantContext.TenantInfo?.Name
            ?? "your pharmacy";
    }

    public async Task<SmsMessage> QueueAsync(
        SmsSettings settings,
        string kind,
        SmsTrigger trigger,
        Guid? customerId,
        string? recipientName,
        string phone,
        SmsTemplateValues values,
        string? referenceKeys,
        string? requestedBy,
        DateTime nowUtc,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(settings);
        ArgumentNullException.ThrowIfNull(values);
        string language = settings.DefaultLanguage;
        string template = await TemplateAsync(kind, language, cancellationToken).ConfigureAwait(false);
        string body = SmsTemplates.Render(template, values with { Pharmacy = values.Pharmacy ?? PharmacyName(settings) });
        if (body.Length > SmsTemplates.MaxMessageLength)
        {
            body = body[..SmsTemplates.MaxMessageLength];
        }

        var message = SmsMessage.Queue(
            kind, trigger, customerId, recipientName, phone, body, language, settings.Provider, referenceKeys,
            ignoresQuietHours: kind is SmsKinds.Receipt or SmsKinds.Test, requestedBy, nowUtc);
        db.SmsMessages.Add(message);
        return message;
    }

    /// <summary>A customer's recent SMS of one kind (the dedupe rules' input).</summary>
    public async Task<IReadOnlyList<RecentSms>> RecentAsync(Guid customerId, string kind, DateTime sinceUtc, CancellationToken cancellationToken) =>
        await db.SmsMessages.AsNoTracking()
            .Where(m => m.CustomerId == customerId && m.Kind == kind && m.CreatedAtUtc > sinceUtc)
            .Select(m => new RecentSms(m.ReferenceKeys, m.Status, m.CreatedAtUtc))
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);
}

/// <summary>The values of a dues reminder: what is owed in total, the earliest due date and the invoice numbers.</summary>
public static class SmsMessageValues
{
    public static SmsTemplateValues Dues(string customerName, IReadOnlyList<CustomerSmsDueInvoiceDto> invoices, string language)
    {
        ArgumentNullException.ThrowIfNull(invoices);
        decimal total = invoices.Sum(i => i.Outstanding);
        DateTime earliest = invoices.Select(i => i.DueDateUtc ?? i.EntryDateUtc).DefaultIfEmpty(DateTime.UtcNow).Min();
        return new SmsTemplateValues(
            Customer: customerName,
            Amount: SmsTemplates.FormatAmount(total, language),
            DueDate: SmsTemplates.FormatDateUtc(earliest, language),
            Invoice: SmsTemplates.InvoiceList(invoices.Select(i => i.DocumentNumber ?? string.Empty).ToList(), language));
    }

    public static SmsTemplateValues Refill(string customerName, DateOnly validTill, string language) =>
        new(Customer: customerName, DueDate: SmsTemplates.FormatDate(validTill, language));

    public static SmsTemplateValues Receipt(string? customerName, string? invoiceNumber, decimal total, string language)
    {
        string fallbackName = language == SmsLanguages.Nepali ? "ग्राहक" : "Customer";
        return new SmsTemplateValues(
            Customer: string.IsNullOrWhiteSpace(customerName) ? fallbackName : customerName,
            Amount: SmsTemplates.FormatAmount(total, language),
            Invoice: invoiceNumber);
    }
}

/// <summary>Asks Hangfire to send a tenant's queue now (the recurring run is the fallback).</summary>
public sealed partial class SmsDispatchTrigger(
    IJobService jobService,
    IMultiTenantContextAccessor<AppTenantInfo> tenantAccessor,
    ILogger<SmsDispatchTrigger> logger)
{
    public void Trigger()
    {
        string? tenantId = tenantAccessor.MultiTenantContext.TenantInfo?.Id;
        if (string.IsNullOrWhiteSpace(tenantId))
        {
            return;
        }

        try
        {
            jobService.Enqueue<ProcessSmsQueueJob>(j => j.RunForTenantAsync(tenantId, CancellationToken.None));
        }
        catch (Exception ex)
        {
            LogTriggerFailed(logger, ex, tenantId);
        }
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "Could not trigger immediate SMS dispatch for tenant {TenantId}; the recurring job will send it")]
    private static partial void LogTriggerFailed(ILogger logger, Exception exception, string tenantId);
}
