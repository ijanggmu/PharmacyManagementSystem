using System.Net;
using FSH.Framework.Core.Domain;
using FSH.Framework.Core.Exceptions;

namespace FSH.Modules.Sales.Domain;

/// <summary>
/// Queue/state-machine statuses. .NET port of the Next.js reference's <c>ird_invoice_queue.status</c>
/// column (scripts/33-ird-invoices-and-narcotic-register.sql: <c>pending</c>, <c>sent</c>,
/// <c>failed</c>). <see cref="Processing"/> is an addition, not present upstream — the reference
/// processes a batch in one pass with no persisted "in flight" marker; adding it here means a crash
/// mid-dispatch leaves a visibly stuck row instead of silently retrying (or double-submitting) forever.
/// </summary>
public enum IrdQueueStatus
{
    Pending = 0,
    Processing = 1,
    Sent = 2,
    Failed = 3,
}

/// <summary>Which CBMS endpoint a queued document goes to.</summary>
public enum IrdDocumentType
{
    /// <summary>A sales bill (tax invoice) — CBMS <c>/api/bill</c>.</summary>
    Bill = 0,

    /// <summary>A credit note: a return, a refund or a cancellation of a bill — CBMS <c>/api/billreturn</c>.</summary>
    Return = 1,
}

/// <summary>
/// .NET port of the Next.js reference's <c>ird_invoice_queue</c> table
/// (scripts/33-ird-invoices-and-narcotic-register.sql), drained by <c>FSH.Modules.Sales.Jobs.ProcessIrdInvoiceQueueJob</c>.
/// One row per document reported to IRD's CBMS: the bill of a completed sale, or a credit note against it (return,
/// refund, cancellation). Retry/backoff state (<see cref="Attempts"/>, <see cref="NextAttemptAtUtc"/>) is enforced
/// by the job; the entity only guards legal state transitions and records what CBMS answered.
/// </summary>
public sealed class IrdInvoiceQueueEntry : AggregateRoot<Guid>
{
    /// <summary>The sale the document belongs to (the bill itself, or the bill a credit note reverses).</summary>
    public Guid SaleId { get; private set; }

    public IrdDocumentType DocumentType { get; private set; }

    /// <summary>The source record: the sale for a bill or cancellation, the return / refund for a credit note.</summary>
    public Guid DocumentId { get; private set; }

    /// <summary>Invoice number (bill) or credit-note number (return) as reported to CBMS.</summary>
    public string? DocumentNumber { get; private set; }

    /// <summary>When the document was issued — the realtime window is measured from here.</summary>
    public DateTime? DocumentDateUtc { get; private set; }

    /// <summary>The CBMS document (bill or bill-return fields, snake_case) frozen at enqueue time. It never holds the
    /// CBMS credentials: those, <c>isrealtime</c> and <c>datetimeClient</c> are added at dispatch.</summary>
    public string PayloadJson { get; private set; } = default!;

    public IrdQueueStatus Status { get; private set; }
    public string? LastError { get; private set; }
    public int Attempts { get; private set; }
    public DateTime? NextAttemptAtUtc { get; private set; }

    /// <summary>What CBMS answered on the last attempt (its result code, e.g. "200", "101", or the HTTP status).</summary>
    public string? ResponseCode { get; private set; }

    public DateTime? LastAttemptAtUtc { get; private set; }
    public DateTime? SentAtUtc { get; private set; }

    /// <summary>Whether the accepted submission went out as real-time (within the realtime window of issue).</summary>
    public bool? IsRealtime { get; private set; }

    public DateTime CreatedAtUtc { get; private set; }
    public DateTime UpdatedAtUtc { get; private set; }

    private IrdInvoiceQueueEntry() { }

    /// <summary>Queues the bill of <paramref name="saleId"/>.</summary>
    public static IrdInvoiceQueueEntry Enqueue(
        Guid saleId, string payloadJson, string? invoiceNumber = null, DateTime? issuedAtUtc = null) =>
        EnqueueDocument(saleId, IrdDocumentType.Bill, saleId, invoiceNumber, issuedAtUtc, payloadJson);

    public static IrdInvoiceQueueEntry EnqueueDocument(
        Guid saleId, IrdDocumentType documentType, Guid documentId, string? documentNumber, DateTime? documentDateUtc, string payloadJson)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(payloadJson);

        var now = DateTime.UtcNow;
        return new IrdInvoiceQueueEntry
        {
            Id = Guid.CreateVersion7(),
            SaleId = saleId,
            DocumentType = documentType,
            DocumentId = documentId == Guid.Empty ? saleId : documentId,
            DocumentNumber = string.IsNullOrWhiteSpace(documentNumber) ? null : documentNumber.Trim(),
            DocumentDateUtc = documentDateUtc,
            PayloadJson = payloadJson,
            Status = IrdQueueStatus.Pending,
            Attempts = 0,
            CreatedAtUtc = now,
            UpdatedAtUtc = now,
        };
    }

    /// <summary>Claims this item for one dispatch attempt: bumps <see cref="Attempts"/> and flips to
    /// <see cref="IrdQueueStatus.Processing"/> immediately (before the outbound call), so a crash
    /// mid-dispatch leaves a visibly "in flight" row rather than a still-Pending one that a naive retry
    /// loop could pick up and double-submit.</summary>
    public void BeginAttempt()
    {
        if (Status != IrdQueueStatus.Pending)
        {
            throw new CustomException(
                $"IRD queue item {Id} is {Status} and cannot start a new dispatch attempt.",
                (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }

        Attempts += 1;
        Status = IrdQueueStatus.Processing;
        LastAttemptAtUtc = DateTime.UtcNow;
        UpdatedAtUtc = LastAttemptAtUtc.Value;
    }

    public void MarkSent(string? responseCode = null, bool? isRealtime = null)
    {
        Status = IrdQueueStatus.Sent;
        LastError = null;
        NextAttemptAtUtc = null;
        ResponseCode = responseCode ?? ResponseCode;
        IsRealtime = isRealtime ?? IsRealtime;
        SentAtUtc = DateTime.UtcNow;
        UpdatedAtUtc = SentAtUtc.Value;
    }

    /// <summary>Records a failed dispatch attempt. When <paramref name="isFinal"/> is false the item
    /// returns to <see cref="IrdQueueStatus.Pending"/> with <paramref name="nextAttemptAtUtc"/> set for
    /// the backoff schedule; when true it moves to <see cref="IrdQueueStatus.Failed"/> permanently.</summary>
    public void MarkFailed(string errorMessage, bool isFinal, DateTime? nextAttemptAtUtc, string? responseCode = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(errorMessage);

        LastError = errorMessage;
        Status = isFinal ? IrdQueueStatus.Failed : IrdQueueStatus.Pending;
        NextAttemptAtUtc = isFinal ? null : nextAttemptAtUtc;
        ResponseCode = responseCode ?? ResponseCode;
        UpdatedAtUtc = DateTime.UtcNow;
    }

    /// <summary>Puts a Pending item back without spending an attempt — a credit note waits for its bill to reach
    /// CBMS first.</summary>
    public void Defer(DateTime untilUtc, string reason)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(reason);
        if (Status != IrdQueueStatus.Pending)
        {
            throw new CustomException(
                $"IRD queue item {Id} is {Status} and cannot be deferred.", (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }

        LastError = reason;
        NextAttemptAtUtc = untilUtc;
        UpdatedAtUtc = DateTime.UtcNow;
    }

    /// <summary>Manual resend of an item that failed for good: back to Pending with a fresh attempt budget.</summary>
    public void Resend()
    {
        if (Status != IrdQueueStatus.Failed)
        {
            throw new CustomException(
                $"Only a failed IRD submission can be resent (this one is {Status}).",
                (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }

        Status = IrdQueueStatus.Pending;
        Attempts = 0;
        NextAttemptAtUtc = null;
        UpdatedAtUtc = DateTime.UtcNow;
    }
}
