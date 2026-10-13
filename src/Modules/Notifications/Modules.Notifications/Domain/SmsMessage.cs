using System.Net;
using FSH.Framework.Core.Domain;
using FSH.Framework.Core.Exceptions;

namespace FSH.Modules.Notifications.Domain;

public enum SmsStatus
{
    /// <summary>Waiting to be sent (first attempt, a retry after backoff, or held by quiet hours / the rate limit).</summary>
    Queued = 0,

    /// <summary>Claimed by a dispatch run; the gateway call is in flight.</summary>
    Sending = 1,

    /// <summary>The gateway accepted it.</summary>
    Sent = 2,

    /// <summary>Gave up: a permanent gateway error, an unusable number, or the attempts ran out.</summary>
    Failed = 3,
}

/// <summary>What caused an SMS: a person (a reminder button, a test, a ticked receipt) or the daily scan.</summary>
public enum SmsTrigger
{
    Manual = 0,
    Automatic = 1,
}

/// <summary>
/// One SMS: both the queue item <c>ProcessSmsQueueJob</c> drains and the log row the SMS log page shows. The text is
/// rendered when the message is queued, so a later template change does not alter what was promised. The phone number
/// is stored in full (it is needed to send) but only ever logged or shown masked. <see cref="ReferenceKeys"/> say what
/// the message was about (<c>SmsDedupe</c>), so reminders are not repeated.
/// </summary>
public sealed class SmsMessage : AggregateRoot<Guid>
{
    public string Kind { get; private set; } = default!;
    public SmsTrigger Trigger { get; private set; }
    public Guid? CustomerId { get; private set; }
    public string? RecipientName { get; private set; }
    public string Phone { get; private set; } = default!;
    public string Body { get; private set; } = default!;
    public string Language { get; private set; } = default!;
    public int Segments { get; private set; }
    public string Encoding { get; private set; } = default!;
    public string Provider { get; private set; } = default!;
    public string? ReferenceKeys { get; private set; }

    /// <summary>Receipts go out at any hour; reminders wait for quiet hours to end.</summary>
    public bool IgnoresQuietHours { get; private set; }

    public SmsStatus Status { get; private set; }
    public int Attempts { get; private set; }
    public DateTime? NextAttemptAtUtc { get; private set; }
    public DateTime? LastAttemptAtUtc { get; private set; }
    public string? LastError { get; private set; }

    /// <summary>What the gateway answered last (its response code, or the HTTP status).</summary>
    public string? ResponseCode { get; private set; }

    /// <summary>The gateway's message on the last attempt (never the request, which carries the token).</summary>
    public string? ResponseMessage { get; private set; }

    public string? ProviderMessageId { get; private set; }

    /// <summary>Credits the gateway charged, when it says.</summary>
    public decimal? Credits { get; private set; }

    public string? RequestedBy { get; private set; }
    public DateTime CreatedAtUtc { get; private set; }
    public DateTime UpdatedAtUtc { get; private set; }
    public DateTime? SentAtUtc { get; private set; }

    private SmsMessage() { }

    public static SmsMessage Queue(
        string kind,
        SmsTrigger trigger,
        Guid? customerId,
        string? recipientName,
        string phone,
        string body,
        string language,
        string provider,
        string? referenceKeys,
        bool ignoresQuietHours,
        string? requestedBy,
        DateTime nowUtc)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(kind);
        ArgumentException.ThrowIfNullOrWhiteSpace(phone);
        ArgumentException.ThrowIfNullOrWhiteSpace(body);
        ArgumentException.ThrowIfNullOrWhiteSpace(provider);

        var size = Sms.SmsText.Count(body);
        return new SmsMessage
        {
            Id = Guid.CreateVersion7(),
            Kind = kind,
            Trigger = trigger,
            CustomerId = customerId,
            RecipientName = string.IsNullOrWhiteSpace(recipientName) ? null : recipientName.Trim(),
            Phone = phone,
            Body = body,
            Language = language,
            Segments = size.Segments,
            Encoding = size.Encoding,
            Provider = provider,
            ReferenceKeys = string.IsNullOrWhiteSpace(referenceKeys) ? null : referenceKeys,
            IgnoresQuietHours = ignoresQuietHours,
            Status = SmsStatus.Queued,
            RequestedBy = requestedBy,
            CreatedAtUtc = nowUtc,
            UpdatedAtUtc = nowUtc,
        };
    }

    /// <summary>Claims the message for one gateway call: bumps <see cref="Attempts"/> and flips to Sending before the call.</summary>
    public void BeginAttempt(DateTime nowUtc)
    {
        if (Status != SmsStatus.Queued)
        {
            throw new CustomException($"SMS {Id} is {Status} and cannot be sent now.", (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }

        Attempts += 1;
        Status = SmsStatus.Sending;
        LastAttemptAtUtc = nowUtc;
        UpdatedAtUtc = nowUtc;
    }

    public void MarkSent(string? responseCode, string? responseMessage, string? providerMessageId, decimal? credits, DateTime nowUtc)
    {
        Status = SmsStatus.Sent;
        LastError = null;
        NextAttemptAtUtc = null;
        ResponseCode = Truncate(responseCode, 32);
        ResponseMessage = Truncate(responseMessage, 500);
        ProviderMessageId = Truncate(providerMessageId, 100);
        Credits = credits;
        SentAtUtc = nowUtc;
        UpdatedAtUtc = nowUtc;
    }

    /// <summary>A failed attempt: back to Queued for <paramref name="nextAttemptAtUtc"/>, or Failed for good.</summary>
    public void MarkFailed(string error, bool isFinal, DateTime? nextAttemptAtUtc, string? responseCode, string? responseMessage, DateTime nowUtc)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(error);
        LastError = Truncate(error, 1000);
        Status = isFinal ? SmsStatus.Failed : SmsStatus.Queued;
        NextAttemptAtUtc = isFinal ? null : nextAttemptAtUtc;
        ResponseCode = Truncate(responseCode, 32) ?? ResponseCode;
        ResponseMessage = Truncate(responseMessage, 500) ?? ResponseMessage;
        UpdatedAtUtc = nowUtc;
    }

    /// <summary>Holds a queued message until <paramref name="untilUtc"/> without spending an attempt (quiet hours).</summary>
    public void Defer(DateTime untilUtc, string reason, DateTime nowUtc)
    {
        if (Status != SmsStatus.Queued)
        {
            throw new CustomException($"SMS {Id} is {Status} and cannot be deferred.", (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }

        NextAttemptAtUtc = untilUtc;
        LastError = reason;
        UpdatedAtUtc = nowUtc;
    }

    /// <summary>Manual retry of a failed message: back to the queue with a fresh attempt budget.</summary>
    public void Retry(DateTime nowUtc)
    {
        if (Status != SmsStatus.Failed)
        {
            throw new CustomException(
                $"Only a failed SMS can be retried (this one is {Status}).", (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }

        Status = SmsStatus.Queued;
        Attempts = 0;
        NextAttemptAtUtc = null;
        UpdatedAtUtc = nowUtc;
    }

    private static string? Truncate(string? value, int max)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        return value.Length <= max ? value : value[..max];
    }
}
