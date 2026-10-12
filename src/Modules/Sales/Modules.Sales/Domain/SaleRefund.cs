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
/// Money paid back against a completed <see cref="Sale"/>, always with an IRD credit note. Every
/// money-back is a refund: a <see cref="SaleReturn"/> (goods coming back) creates one linked through
/// <see cref="ReturnId"/>, and a refund on its own covers money back without goods (an overcharge, a
/// damaged or expired item the customer keeps). It never touches stock — completing one posts the
/// reversing voucher (cash and VAT) via <c>RefundCompletedIntegrationEvent</c>.
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

    /// <summary>The return this refund pays out, when the money is going back because goods came back.
    /// Its status follows that return's; it is never changed or deleted on its own.</summary>
    public Guid? ReturnId { get; private set; }
    public Guid? CustomerId { get; private set; }
    public DateTime RefundDateUtc { get; private set; }
    public RefundStatus Status { get; private set; }
    public string RefundReason { get; private set; } = default!;
    public string RefundType { get; private set; } = default!;
    public string RefundMethod { get; private set; } = default!;
    /// <summary>Legacy: an extra "tax refund" older refunds added on top of the items. Prices already
    /// include VAT, so that refunded the VAT twice. Always 0 on new refunds; kept so older refunds still
    /// show the amount they actually paid out.</summary>
    public decimal TaxRefundAmount { get; }
    public decimal ProcessingFee { get; private set; }

    /// <summary>The part of <see cref="NetRefundAmount"/> that goes onto the customer's account instead of
    /// being paid out: it first clears what they still owe on a credit sale, and all of it does for a
    /// store-credit refund. The rest is paid out by <see cref="RefundMethod"/>.</summary>
    public decimal AccountCreditAmount { get; private set; }

    /// <summary>Of the amount paid out (net minus account credit), what leaves the cash drawer...</summary>
    public decimal CashPaidOut { get; private set; }

    /// <summary>...and what goes back through the bank (card, Fonepay, eSewa, transfer).</summary>
    public decimal BankPaidOut { get; private set; }
    public string? Notes { get; private set; }
    public string RefundNumber { get; private set; } = default!;
    public string? CreditNoteNumber { get; private set; }

    /// <summary>BS year the credit note's fiscal year started in (sequential numbering). Null on older refunds.</summary>
    public int? FiscalYear { get; private set; }

    /// <summary>VAT breakdown of the refunded lines, derived from the original sale's VAT rate and each
    /// line's VAT status. Printed on the credit note, and the VAT part is reversed out of VAT Payable.
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

    /// <summary>Items-only total, at what the customer paid per unit (script 68's <c>v_items_total</c>).</summary>
    public decimal RefundAmount => _items.Sum(i => i.TotalRefundAmount);

    /// <summary>Items total - processing fee, floored at 0 — the amount actually paid back and posted.
    /// (<see cref="TaxRefundAmount"/> is 0 except on older refunds.)</summary>
    public decimal NetRefundAmount => Math.Max(0m, RefundAmount + TaxRefundAmount - ProcessingFee);

    private SaleRefund() { }

    public static SaleRefund Create(
        Guid branchId, Guid originalSaleId, Guid? customerId, DateTime refundDateUtc, RefundStatus status, string refundReason,
        string refundType, string refundMethod, decimal processingFee, string? notes, Guid? returnId = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(refundReason);

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
            ReturnId = returnId,
            CustomerId = customerId,
            RefundDateUtc = refundDateUtc,
            Status = status,
            RefundReason = refundReason.Trim(),
            RefundType = string.IsNullOrWhiteSpace(refundType) ? "partial_refund" : refundType.Trim(),
            RefundMethod = string.IsNullOrWhiteSpace(refundMethod) ? "original_payment" : refundMethod.Trim(),
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

    /// <summary>
    /// Splits the amount paid out between the cash drawer and the bank. A cash refund is all cash; a refund to
    /// the original payment follows how the sale was paid (<paramref name="cashShare"/>, 0–1, of what was
    /// received); any other method goes through the bank.
    /// </summary>
    public void SplitPayout(decimal cashShare)
    {
        decimal paidOut = NetRefundAmount - AccountCreditAmount;
        decimal share = RefundMethod.ToUpperInvariant() switch
        {
            "CASH" => 1m,
            "ORIGINAL_PAYMENT" => Math.Clamp(cashShare, 0m, 1m),
            _ => 0m,
        };
        CashPaidOut = Math.Round(paidOut * share, 2, MidpointRounding.AwayFromZero);
        BankPaidOut = paidOut - CashPaidOut;
    }

    /// <summary>Sets how much of the refund goes onto the customer's account (0 to the net amount).</summary>
    public void SetAccountCredit(decimal amount)
    {
        if (amount < 0 || amount > NetRefundAmount)
        {
            throw new CustomException(
                "The account credit must be between 0 and the refund amount.", (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
        }

        AccountCreditAmount = amount;
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

        // Rejected is final: a rejected refund no longer counts against the sale's return/refund limits, so
        // re-opening it could give back units or money that a later refund has already given back.
        if (Status == RefundStatus.Rejected && status != RefundStatus.Rejected)
        {
            throw new CustomException(
                "A rejected refund can't be re-opened. Record a new refund instead.", (IEnumerable<string>?)null, HttpStatusCode.Conflict);
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
