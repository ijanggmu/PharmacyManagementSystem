using FSH.Framework.Shared.Persistence;
using Mediator;

namespace FSH.Modules.Notifications.Contracts.v1.Sms;

/// <summary>SMS gateway names as the API and settings carry them.</summary>
public static class SmsProviderNames
{
    /// <summary>Writes the message to the application log instead of sending it (development / tests).</summary>
    public const string LogOnly = "LogOnly";

    /// <summary>Sparrow SMS (sparrowsms.com).</summary>
    public const string Sparrow = "Sparrow";

    /// <summary>Aakash SMS (aakashsms.com).</summary>
    public const string Aakash = "Aakash";

    public static IReadOnlyList<string> All { get; } = [LogOnly, Sparrow, Aakash];
}

/// <summary>What an SMS is for. Template kinds are the first three.</summary>
public static class SmsKinds
{
    public const string DuesReminder = "DuesReminder";
    public const string RefillReminder = "RefillReminder";
    public const string Receipt = "Receipt";
    public const string Test = "Test";

    public static IReadOnlyList<string> TemplateKinds { get; } = [DuesReminder, RefillReminder, Receipt];
}

/// <summary>Template languages.</summary>
public static class SmsLanguages
{
    public const string English = "en";
    public const string Nepali = "ne";

    public static IReadOnlyList<string> All { get; } = [English, Nepali];
}

public sealed record SmsTemplateDto(string Kind, string Language, string Body);

/// <summary>
/// The tenant's SMS settings. The gateway API token is write-only: <see cref="HasApiToken"/> says whether one is
/// stored, the token itself is never returned. Quiet hours are Nepal time (NPT), whole hours; start == end turns them
/// off. Receipts are exempt from quiet hours.
/// </summary>
public sealed record SmsSettingsDto(
    bool Enabled,
    string Provider,
    string? SenderId,
    bool HasApiToken,
    string? PharmacyName,
    string DefaultLanguage,
    bool ReceiptsEnabled,
    bool AutoDuesReminders,
    int DuesReminderDays,
    bool AutoRefillReminders,
    int RefillReminderDays,
    int QuietHoursStart,
    int QuietHoursEnd,
    int MaxPerHour,
    IReadOnlyList<SmsTemplateDto> Templates,
    DateTime? UpdatedAtUtc);

/// <summary>One SMS in the log. The phone number is masked (e.g. 98******34).</summary>
public sealed record SmsMessageDto(
    Guid Id,
    string Kind,
    string Status,
    string Trigger,
    Guid? CustomerId,
    string? RecipientName,
    string PhoneMasked,
    string Body,
    string Language,
    int Segments,
    string Encoding,
    string Provider,
    int Attempts,
    string? LastError,
    string? ResponseCode,
    string? ResponseMessage,
    string? ProviderMessageId,
    decimal? Credits,
    string? RequestedBy,
    DateTime CreatedAtUtc,
    DateTime? SentAtUtc,
    DateTime? NextAttemptAtUtc);

public sealed record GetSmsSettingsQuery : IQuery<SmsSettingsDto>;

/// <summary>Whether SMS (and SMS receipts) are on — all the checkout needs to offer the "SMS receipt" tick.</summary>
public sealed record SmsStatusDto(bool Enabled, bool ReceiptsEnabled);

public sealed record GetSmsStatusQuery : IQuery<SmsStatusDto>;

/// <summary>Saves the SMS settings. A blank <paramref name="ApiToken"/> keeps the stored token; templates not listed
/// keep their stored (or default) text.</summary>
public sealed record UpdateSmsSettingsCommand(
    bool Enabled,
    string Provider,
    string? SenderId,
    string? ApiToken,
    string? PharmacyName,
    string DefaultLanguage,
    bool ReceiptsEnabled,
    bool AutoDuesReminders,
    int DuesReminderDays,
    bool AutoRefillReminders,
    int RefillReminderDays,
    int QuietHoursStart,
    int QuietHoursEnd,
    int MaxPerHour,
    IReadOnlyList<SmsTemplateDto>? Templates = null) : ICommand<SmsSettingsDto>;

/// <summary>Queues a test SMS to <paramref name="Phone"/> with the saved settings (ignores quiet hours).</summary>
public sealed record SendTestSmsCommand(string Phone) : ICommand<SmsMessageDto>;

/// <summary>Queues a dues reminder to the customer for everything they owe (manual "Send reminder").</summary>
public sealed record SendDuesReminderCommand(Guid CustomerId) : ICommand<SmsMessageDto>;

/// <summary>Puts a failed SMS back in the queue with a fresh attempt budget.</summary>
public sealed record RetrySmsMessageCommand(Guid Id) : ICommand<SmsMessageDto>;

/// <summary>The SMS log, newest first.</summary>
public sealed record SearchSmsMessagesQuery(
    int PageNumber = 1,
    int PageSize = 20,
    string? Status = null,
    string? Kind = null,
    Guid? CustomerId = null) : IQuery<PagedResponse<SmsMessageDto>>;
