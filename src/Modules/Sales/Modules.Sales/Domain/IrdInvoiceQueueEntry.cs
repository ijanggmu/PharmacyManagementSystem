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

/// <summary>
/// .NET port of the Next.js reference's <c>ird_invoice_queue</c> table
/// (scripts/33-ird-invoices-and-narcotic-register.sql), populated by <c>enqueueIrdInvoice</c>
/// (lib/server/services/reports-service.ts) and drained by <c>processIrdQueueBatch</c>
/// (lib/api/ird-service.ts). One row per sale sent for IRD (Nepal Inland Revenue Department) e-invoice
/// submission. Retry/backoff state (<see cref="Attempts"/>, <see cref="NextAttemptAtUtc"/>) is enforced
/// by <c>FSH.Modules.Sales.Jobs.ProcessIrdInvoiceQueueJob</c>, not by this entity directly — the entity
/// only guards legal state transitions.
/// </summary>
public sealed class IrdInvoiceQueueEntry : AggregateRoot<Guid>
{
    public Guid SaleId { get; private set; }

    /// <summary>Serialized invoice payload built at enqueue time — same shape as the Next.js
    /// reference's in-memory payload object, persisted as JSON instead of re-derived on each retry.</summary>
    public string PayloadJson { get; private set; } = default!;

    public IrdQueueStatus Status { get; private set; }
    public string? LastError { get; private set; }
    public int Attempts { get; private set; }
    public DateTime? NextAttemptAtUtc { get; private set; }
    public DateTime CreatedAtUtc { get; private set; }
    public DateTime UpdatedAtUtc { get; private set; }

    private IrdInvoiceQueueEntry() { }

    public static IrdInvoiceQueueEntry Enqueue(Guid saleId, string payloadJson)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(payloadJson);

        var now = DateTime.UtcNow;
        return new IrdInvoiceQueueEntry
        {
            Id = Guid.CreateVersion7(),
            SaleId = saleId,
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
        UpdatedAtUtc = DateTime.UtcNow;
    }

    public void MarkSent()
    {
        Status = IrdQueueStatus.Sent;
        LastError = null;
        NextAttemptAtUtc = null;
        UpdatedAtUtc = DateTime.UtcNow;
    }

    /// <summary>Records a failed dispatch attempt. When <paramref name="isFinal"/> is false the item
    /// returns to <see cref="IrdQueueStatus.Pending"/> with <paramref name="nextAttemptAtUtc"/> set for
    /// the backoff schedule; when true it moves to <see cref="IrdQueueStatus.Failed"/> permanently.</summary>
    public void MarkFailed(string errorMessage, bool isFinal, DateTime? nextAttemptAtUtc)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(errorMessage);

        LastError = errorMessage;
        Status = isFinal ? IrdQueueStatus.Failed : IrdQueueStatus.Pending;
        NextAttemptAtUtc = isFinal ? null : nextAttemptAtUtc;
        UpdatedAtUtc = DateTime.UtcNow;
    }
}
