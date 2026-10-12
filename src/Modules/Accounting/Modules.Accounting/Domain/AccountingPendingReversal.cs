using FSH.Framework.Core.Domain;

namespace FSH.Modules.Accounting.Domain;

/// <summary>
/// "Reversed before posted" tombstone. Integration events are delivered at least once and in no guaranteed
/// order, so a cancellation (<c>SaleCancelled</c>, <c>DirectGoodsReceiptVoided</c>) can be handled before the
/// event that posts the original voucher (<c>SaleCompleted</c>, <c>DirectGoodsReceiptPosted</c>) — typically
/// when the first delivery of the original failed and the outbox retried it later. With nothing to reverse
/// yet, the cancellation records this row; when the original voucher is finally posted,
/// <c>VoucherPostingService.PostSystemVoucherAsync</c> sees it and reverses that voucher straight away
/// (dated at the cancellation), so the source document never stays booked after it was cancelled.
/// One row per tenant and (<see cref="ReferenceType"/>, <see cref="ReferenceId"/>).
/// </summary>
public sealed class AccountingPendingReversal : AggregateRoot<Guid>
{
    public string ReferenceType { get; private set; } = default!;
    public Guid ReferenceId { get; private set; }
    public string Reason { get; private set; } = default!;

    /// <summary>The date the reversal should carry (the cancellation date).</summary>
    public DateTime ReversalDateUtc { get; private set; }
    public DateTime CreatedAtUtc { get; private set; }

    /// <summary>Set once the original voucher was posted and reversed.</summary>
    public DateTime? ResolvedAtUtc { get; private set; }

    /// <summary>The reversing voucher created when this tombstone was resolved.</summary>
    public Guid? ReversalVoucherId { get; private set; }

    private AccountingPendingReversal() { }

    public static AccountingPendingReversal Create(string referenceType, Guid referenceId, string reason, DateTime reversalDateUtc)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(referenceType);

        string trimmed = string.IsNullOrWhiteSpace(reason) ? "Reversed before the original was posted" : reason.Trim();
        return new AccountingPendingReversal
        {
            Id = Guid.CreateVersion7(),
            ReferenceType = referenceType.Trim(),
            ReferenceId = referenceId,
            Reason = trimmed.Length > 512 ? trimmed[..512] : trimmed,
            ReversalDateUtc = reversalDateUtc,
            CreatedAtUtc = DateTime.UtcNow,
        };
    }

    public void Resolve(Guid reversalVoucherId)
    {
        ResolvedAtUtc = DateTime.UtcNow;
        ReversalVoucherId = reversalVoucherId;
    }
}
