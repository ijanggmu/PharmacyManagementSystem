using System.Net;
using FSH.Framework.Core.Domain;
using FSH.Framework.Core.Exceptions;

namespace FSH.Modules.Sales.Domain;

public enum RefundStatus
{
    Pending = 0,
    Approved = 1,
    Rejected = 2,
    Completed = 3,
}

/// <summary>
/// A monetary refund against a completed <see cref="Sale"/> — mirrors the Next.js
/// <c>sales_refunds</c>/<c>sales_refund_items</c> tables and the <c>create_sales_refund</c> RPC
/// (scripts/68). Purely financial: unlike <see cref="SaleReturn"/> it never touches physical stock
/// (the Next.js RPC never calls a restock routine for a refund) — completing one only posts a
/// reversing accounting voucher via <c>RefundCompletedIntegrationEvent</c>.
/// </summary>
public sealed class SaleRefund : AggregateRoot<Guid>, ISoftDeletable
{
    private readonly List<SaleRefundItem> _items = [];

    /// <summary>The branch this refund is processed at — required, same extension-beyond-the-scope-
    /// table reasoning as <see cref="SaleReturn.BranchId"/>: a refund happens at a physical branch
    /// exactly like the originating <see cref="Sale"/>. Resolved via
    /// <c>ICurrentBranch.RequireBranchIdAsync</c> in <c>CreateRefundCommandHandler</c>.</summary>
    public Guid BranchId { get; private set; }

    public Guid OriginalSaleId { get; private set; }
    public Guid? CustomerId { get; private set; }
    public DateTime RefundDateUtc { get; private set; }
    public RefundStatus Status { get; private set; }
    public string RefundReason { get; private set; } = default!;
    public string RefundType { get; private set; } = default!;
    public string RefundMethod { get; private set; } = default!;
    public decimal TaxRefundAmount { get; private set; }
    public decimal ProcessingFee { get; private set; }
    public string? Notes { get; private set; }
    public string RefundNumber { get; private set; } = default!;
    public string? CreditNoteNumber { get; private set; }

    /// <summary>BS year the credit note's fiscal year started in (sequential numbering). Null on older refunds.</summary>
    public int? FiscalYear { get; private set; }

    /// <summary>VAT breakdown of the refunded lines, derived from the original sale's VAT rate and each
    /// line's VAT status. Informational (printed on the credit note); it does not change what is posted.
    /// Null when the original sale predates stored VAT breakdowns.</summary>
    public decimal? VatRatePercent { get; private set; }

    public decimal? TaxableAmount { get; private set; }

    public decimal? VatAmount { get; private set; }

    public decimal? ExemptAmount { get; private set; }
    public DateTime CreatedAtUtc { get; private set; }

    /// <summary>Set exactly once, the first time this refund transitions into <see
    /// cref="RefundStatus.Completed"/> — guards against posting the reversing voucher twice.</summary>
    public DateTime? AccountingPostedAtUtc { get; private set; }

    public bool IsDeleted { get; private set; }
    public DateTimeOffset? DeletedOnUtc { get; private set; }
    public string? DeletedBy { get; private set; }

    /// <summary>A posted refund (completed, or its reversing voucher already raised) is part of the
    /// ledger and can no longer be removed; correct it with a new refund instead.</summary>
    public bool IsPosted => Status == RefundStatus.Completed || AccountingPostedAtUtc is not null;

    /// <summary>Soft-deletes a refund that has not been posted. Items stay in place so the record is
    /// still auditable; the global query filter hides the refund from every read.</summary>
    public void SoftDelete(string deletedBy)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(deletedBy);

        if (IsPosted)
        {
            throw new CustomException(
                $"Refund {RefundNumber} is posted to accounting and cannot be deleted. Create a new refund instead.",
                (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }

        IsDeleted = true;
        DeletedOnUtc = DateTimeOffset.UtcNow;
        DeletedBy = deletedBy;
    }

    public IReadOnlyList<SaleRefundItem> Items => _items;

    /// <summary>Items-only total, at the sale's actual unit price (script 68's <c>v_items_total</c>).</summary>
    public decimal RefundAmount => _items.Sum(i => i.TotalRefundAmount);

    /// <summary>Items total + tax refunded - processing fee, floored at 0 (script 68's
    /// <c>v_net_refund_amount</c>) — the amount actually posted to the books / paid back.</summary>
    public decimal NetRefundAmount => Math.Max(0m, RefundAmount + TaxRefundAmount - ProcessingFee);

    private SaleRefund() { }

    public static SaleRefund Create(
        Guid branchId, Guid originalSaleId, Guid? customerId, DateTime refundDateUtc, RefundStatus status, string refundReason,
        string refundType, string refundMethod, decimal taxRefundAmount, decimal processingFee, string? notes)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(refundReason);

        if (taxRefundAmount < 0)
        {
            throw new CustomException("Tax refund amount cannot be negative.", (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
        }

        if (processingFee < 0)
        {
            throw new CustomException("Processing fee cannot be negative.", (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
        }

        var id = Guid.CreateVersion7();
        return new SaleRefund
        {
            Id = id,
            BranchId = branchId,
            OriginalSaleId = originalSaleId,
            CustomerId = customerId,
            RefundDateUtc = refundDateUtc,
            Status = status,
            RefundReason = refundReason.Trim(),
            RefundType = string.IsNullOrWhiteSpace(refundType) ? "partial_refund" : refundType.Trim(),
            RefundMethod = string.IsNullOrWhiteSpace(refundMethod) ? "original_payment" : refundMethod.Trim(),
            TaxRefundAmount = taxRefundAmount,
            ProcessingFee = processingFee,
            Notes = notes?.Trim(),
            RefundNumber = $"REF-{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}",
            CreatedAtUtc = DateTime.UtcNow,
        };
    }

    /// <summary>
    /// Adds a refund line. <paramref name="unitPrice"/> MUST come from the referenced <c>SaleItem</c>
    /// (never client-supplied) — the handler's responsibility, same as <see cref="SaleReturn.AddItem"/>.
    /// </summary>
    public void AddItem(Guid saleItemId, Guid medicineId, decimal quantityRefunded, decimal unitPrice)
    {
        var item = SaleRefundItem.Create(saleItemId, medicineId, quantityRefunded, unitPrice);
        item.AssignRefund(Id);
        _items.Add(item);
    }

    /// <summary>Assigns the credit-note number once the refund id is known (mirrors the Next.js flow,
    /// which computes <c>formatCreditNoteNumber(refundId, refundDate)</c> only after the RPC
    /// returns).</summary>
    public void AssignCreditNoteNumber(string creditNoteNumber)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(creditNoteNumber);
        CreditNoteNumber = creditNoteNumber;
    }

    /// <summary>Sets the sequential credit-note number and its fiscal year (write-once).</summary>
    public void AssignCreditNote(string creditNoteNumber, int fiscalYear)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(creditNoteNumber);
        if (CreditNoteNumber is not null && FiscalYear is not null)
        {
            return;
        }

        CreditNoteNumber = creditNoteNumber.Trim();
        FiscalYear = fiscalYear;
    }

    /// <summary>
    /// Splits the refunded lines into taxable value, VAT and exempt value using the original sale's VAT
    /// rate (prices are VAT-inclusive, same formula as <see cref="Sale.ApplyVat"/>).
    /// <paramref name="isTaxableBySaleItem"/> maps each refunded sale line to its VAT status.
    /// </summary>
    public void ApplyVatBreakdown(decimal? saleVatRatePercent, IReadOnlyDictionary<Guid, bool> isTaxableBySaleItem)
    {
        ArgumentNullException.ThrowIfNull(isTaxableBySaleItem);
        if (saleVatRatePercent is not { } rate)
        {
            return;
        }

        decimal taxableGross = _items.Where(i => isTaxableBySaleItem.GetValueOrDefault(i.SaleItemId, true)).Sum(i => i.TotalRefundAmount);
        decimal vat = rate > 0
            ? Math.Round(taxableGross * rate / (100m + rate), 2, MidpointRounding.AwayFromZero)
            : 0m;

        VatRatePercent = rate;
        VatAmount = vat;
        TaxableAmount = taxableGross - vat;
        ExemptAmount = _items.Where(i => !isTaxableBySaleItem.GetValueOrDefault(i.SaleItemId, true)).Sum(i => i.TotalRefundAmount);
    }

    /// <summary>Updates the free-text reason/notes without touching status — mirrors the Next.js PATCH
    /// schema, which allows these independently of a status change.</summary>
    public void UpdateDetails(string? refundReason, string? notes)
    {
        if (!string.IsNullOrWhiteSpace(refundReason))
        {
            RefundReason = refundReason.Trim();
        }

        if (notes is not null)
        {
            Notes = notes.Trim();
        }
    }

    /// <summary>Terminal-state guard identical in shape to <see cref="SaleReturn.SetStatus"/>.</summary>
    public void SetStatus(RefundStatus status)
    {
        if (Status == RefundStatus.Completed && status != RefundStatus.Completed)
        {
            throw new CustomException(
                "A completed refund cannot change status.", (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }

        if (Status == RefundStatus.Rejected && status == RefundStatus.Completed)
        {
            throw new CustomException(
                "A rejected refund cannot be completed.", (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }

        Status = status;
    }

    /// <summary>Marks the accounting voucher as posted, exactly once — same double-post guard shape
    /// as <see cref="SaleReturn.MarkStockRestoredIfNeeded"/>.</summary>
    public bool MarkAccountingPostedIfNeeded()
    {
        if (AccountingPostedAtUtc is not null)
        {
            return false;
        }

        AccountingPostedAtUtc = DateTime.UtcNow;
        return true;
    }
}
