using FSH.Framework.Core.Domain;
using FSH.Modules.Notifications.Contracts.v1.Sms;

namespace FSH.Modules.Notifications.Domain;

/// <summary>
/// One row per tenant: which SMS gateway the pharmacy uses and how. The gateway API token is stored already encrypted
/// (Data Protection, <c>SmsSecrets</c>) — this entity never sees it in plain text, and it is never logged or returned.
/// Quiet hours are whole Nepal-time hours; start == end turns them off.
/// </summary>
public sealed class SmsSettings : AggregateRoot<Guid>
{
    public const int DefaultDuesReminderDays = 7;
    public const int DefaultRefillReminderDays = 3;
    public const int DefaultMaxPerHour = 100;

    public bool Enabled { get; private set; }
    public string Provider { get; private set; } = SmsProviderNames.LogOnly;

    /// <summary>The sender identity registered with the gateway (Sparrow's <c>from</c>).</summary>
    public string? SenderId { get; private set; }

    public string? ApiTokenProtected { get; private set; }

    /// <summary>The name the {pharmacy} placeholder shows; null uses the tenant name.</summary>
    public string? PharmacyName { get; private set; }

    public string DefaultLanguage { get; private set; } = SmsLanguages.English;

    /// <summary>The cashier may tick "SMS receipt" at checkout.</summary>
    public bool ReceiptsEnabled { get; private set; }

    /// <summary>Daily automatic dues reminders for invoices overdue by <see cref="DuesReminderDays"/> days (at most one
    /// per invoice every <see cref="DuesReminderDays"/> days), to customers who agreed to SMS.</summary>
    public bool AutoDuesReminders { get; private set; }
    public int DuesReminderDays { get; private set; } = DefaultDuesReminderDays;

    /// <summary>Daily refill reminders for prescriptions whose refill window closes within
    /// <see cref="RefillReminderDays"/> days, to customers who agreed to SMS.</summary>
    public bool AutoRefillReminders { get; private set; }
    public int RefillReminderDays { get; private set; } = DefaultRefillReminderDays;

    public int QuietHoursStart { get; private set; } = 21;
    public int QuietHoursEnd { get; private set; } = 7;

    /// <summary>Most SMS the tenant sends in any hour (rate limit).</summary>
    public int MaxPerHour { get; private set; } = DefaultMaxPerHour;

    public DateTime UpdatedAtUtc { get; private set; }

    private SmsSettings() { }

    public static SmsSettings CreateDefault() => new()
    {
        Id = Guid.CreateVersion7(),
        UpdatedAtUtc = DateTime.UtcNow,
    };

    /// <summary>A null <paramref name="apiTokenProtected"/> keeps the stored token.</summary>
    public void Update(
        bool enabled,
        string provider,
        string? senderId,
        string? apiTokenProtected,
        string? pharmacyName,
        string defaultLanguage,
        bool receiptsEnabled,
        bool autoDuesReminders,
        int duesReminderDays,
        bool autoRefillReminders,
        int refillReminderDays,
        int quietHoursStart,
        int quietHoursEnd,
        int maxPerHour)
    {
        if (!SmsProviderNames.All.Contains(provider, StringComparer.Ordinal))
        {
            throw new ArgumentOutOfRangeException(nameof(provider), provider, "Unknown SMS provider.");
        }

        if (!SmsLanguages.All.Contains(defaultLanguage, StringComparer.Ordinal))
        {
            throw new ArgumentOutOfRangeException(nameof(defaultLanguage), defaultLanguage, "Unknown SMS language.");
        }

        Enabled = enabled;
        Provider = provider;
        SenderId = Normalize(senderId);
        PharmacyName = Normalize(pharmacyName);
        DefaultLanguage = defaultLanguage;
        ReceiptsEnabled = receiptsEnabled;
        AutoDuesReminders = autoDuesReminders;
        DuesReminderDays = Math.Clamp(duesReminderDays, 1, 365);
        AutoRefillReminders = autoRefillReminders;
        RefillReminderDays = Math.Clamp(refillReminderDays, 0, 60);
        QuietHoursStart = Math.Clamp(quietHoursStart, 0, 23);
        QuietHoursEnd = Math.Clamp(quietHoursEnd, 0, 23);
        MaxPerHour = Math.Clamp(maxPerHour, 1, 10_000);
        if (apiTokenProtected is not null)
        {
            ApiTokenProtected = apiTokenProtected;
        }

        UpdatedAtUtc = DateTime.UtcNow;
    }

    /// <summary>Everything the chosen gateway needs is present (the log-only provider needs nothing).</summary>
    public bool IsConfigured => Provider switch
    {
        SmsProviderNames.LogOnly => true,
        SmsProviderNames.Sparrow => ApiTokenProtected is not null && !string.IsNullOrWhiteSpace(SenderId),
        _ => ApiTokenProtected is not null,
    };

    private static string? Normalize(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}

/// <summary>A tenant's text for one kind of SMS in one language. Missing rows fall back to the built-in defaults.</summary>
public sealed class SmsTemplate : AggregateRoot<Guid>
{
    public string Kind { get; private set; } = default!;
    public string Language { get; private set; } = default!;
    public string Body { get; private set; } = default!;
    public DateTime UpdatedAtUtc { get; private set; }

    private SmsTemplate() { }

    public static SmsTemplate Create(string kind, string language, string body)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(kind);
        ArgumentException.ThrowIfNullOrWhiteSpace(language);
        ArgumentException.ThrowIfNullOrWhiteSpace(body);
        return new SmsTemplate
        {
            Id = Guid.CreateVersion7(),
            Kind = kind,
            Language = language,
            Body = body.Trim(),
            UpdatedAtUtc = DateTime.UtcNow,
        };
    }

    public void SetBody(string body)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(body);
        Body = body.Trim();
        UpdatedAtUtc = DateTime.UtcNow;
    }
}
