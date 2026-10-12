using System.Net;
using FSH.Framework.Core.Domain;
using FSH.Framework.Core.Exceptions;

namespace FSH.Modules.Sales.Domain;

public enum ReturnStatus
{
    Pending = 0,
    Approved = 1,
    Rejected = 2,
    Completed = 3,
}

public enum PackagingCondition
{
    Sealed = 0,
    Opened = 1,
    Damaged = 2,
}

/// <summary>
/// A customer return of previously-sold medicine lines against a completed <see cref="Sale"/>.
/// Mirrors the Next.js <c>medicine_returns</c>/<c>return_items</c> tables and the
/// <c>create_medicine_return</c>/<c>restore_return_stock</c> RPCs (scripts/68, scripts/80) — the
/// per-line "cannot return more than was sold" cap and the exactly-once stock restoration are ported
/// as explicit guards here instead of PL/pgSQL. Unlike the SQL RPC (which restores stock and posts
/// the accounting voucher inline, in the same transaction), this port follows the Sales module's own
/// established pattern (<see cref="Sale.Cancel"/>/<c>CancelSaleCommandHandler</c>): restoring stock
/// (Inventory) and posting the reversing voucher (Accounting) happen asynchronously off a
/// <c>ReturnCompletedIntegrationEvent</c> via the Outbox once this aggregate's own transition to
/// <see cref="ReturnStatus.Completed"/> is committed.
/// </summary>
public sealed class SaleReturn : AggregateRoot<Guid>, ISoftDeletable
{
    private readonly List<SaleReturnItem> _items = [];

    /// <summary>The branch this return is processed at — required. Not in branch-scoping-plan.md's
    /// literal scope table (it predates the Returns/Refunds port), but treated as REQUIRED here as
    /// an explicit extension: a return happens at a physical branch exactly like the originating
    /// <see cref="Sale"/>, so it gets the same treatment — resolved via
    /// <c>ICurrentBranch.RequireBranchIdAsync</c> in <c>CreateReturnCommandHandler</c>.</summary>
    public Guid BranchId { get; private set; }

    public Guid SaleId { get; private set; }
    public Guid? CustomerId { get; private set; }
    public DateTime ReturnDateUtc { get; private set; }
    public ReturnStatus Status { get; private set; }
    public string ReturnReason { get; private set; } = default!;
    public string? Notes { get; private set; }
    public DateTime CreatedAtUtc { get; private set; }

    /// <summary>Set exactly once, the first time this return transitions into <see
    /// cref="ReturnStatus.Completed"/> — guards against restocking/posting twice on a repeat
    /// completion (the same invariant <c>restore_return_stock</c> enforced via this column).</summary>
    public DateTime? StockRestoredAtUtc { get; private set; }

    /// <summary>How the money goes back (see <see cref="RefundMethods"/>); "cash" for returns recorded
    /// before it was stored.</summary>
    public string RefundMethod { get; private set; } = RefundMethods.Cash;

    /// <summary>VAT breakdown of the returned lines (original sale's rate, each line's VAT status). Null
    /// when the original sale predates stored VAT breakdowns, or the return predates this field.</summary>
    public decimal? VatRatePercent { get; private set; }

    public decimal? TaxableAmount { get; private set; }

    public decimal? VatAmount { get; private set; }

    public decimal? ExemptAmount { get; private set; }

    /// <summary>Settlement split recorded when the return completes (<see cref="RecordSettlement"/>):
    /// cash out of the drawer, bank/card/wallet, and credit to the customer's account. Null until
    /// completed, and on returns completed before the split was stored.</summary>
    public decimal? SettlementCashAmount { get; private set; }

    public decimal? SettlementBankAmount { get; private set; }

    public decimal? SettlementOnAccountAmount { get; private set; }

    /// <summary>Sequential IRD credit-note number (shared CN series of the branch with refunds), assigned when
    /// the return completes — a pending, rejected or deleted return never burns a number. Null until then, and
    /// on returns completed before returns were numbered.</summary>
    public string? CreditNoteNumber { get; private set; }

    /// <summary>BS year the credit note's fiscal year started in. Null until numbered.</summary>
    public int? FiscalYear { get; private set; }

    public bool IsDeleted { get; private set; }
    public DateTimeOffset? DeletedOnUtc { get; private set; }
    public string? DeletedBy { get; private set; }

    /// <summary>A return that has restored stock (or is completed) has stock movements and is part of
    /// the ledger, so it can no longer be removed; record a new return to correct it instead.</summary>
    public bool IsPosted => Status == ReturnStatus.Completed || StockRestoredAtUtc is not null;

    /// <summary>Soft-deletes a return that has not restored stock. Items stay in place so the record is
    /// still auditable; the global query filter hides the return from every read.</summary>
    public void SoftDelete(string deletedBy)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(deletedBy);

        if (IsPosted)
        {
            throw new CustomException(
                "This return has been completed and its stock restored, so it cannot be deleted. Record a new return instead.",
                (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }

        IsDeleted = true;
        DeletedOnUtc = DateTimeOffset.UtcNow;
        DeletedBy = deletedBy;
    }

    public IReadOnlyList<SaleReturnItem> Items => _items;

    /// <summary>Authoritative total: the sum of each line's quantity x the SALE's actual unit price
    /// (never a client-supplied amount) — see <see cref="SaleReturnItem.TotalAmount"/>.</summary>
    public decimal TotalReturnAmount => _items.Sum(i => i.TotalAmount);

    private SaleReturn() { }

    public static SaleReturn Create(
        Guid branchId, Guid saleId, Guid? customerId, DateTime returnDateUtc, ReturnStatus status, string reason, string? notes,
        string? refundMethod = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(reason);

        return new SaleReturn
        {
            Id = Guid.CreateVersion7(),
            BranchId = branchId,
            SaleId = saleId,
            CustomerId = customerId,
            ReturnDateUtc = returnDateUtc,
            Status = status,
            ReturnReason = reason.Trim(),
            Notes = notes?.Trim(),
            RefundMethod = string.IsNullOrWhiteSpace(refundMethod) ? RefundMethods.Cash : RefundMethods.Normalize(refundMethod),
            CreatedAtUtc = DateTime.UtcNow,
        };
    }

    /// <summary>
    /// Adds a return line. <paramref name="unitPrice"/>/<paramref name="unitCostPrice"/> MUST come
    /// from the referenced <c>SaleItem</c>, not the caller — the handler is responsible for that
    /// (this mirrors <c>create_medicine_return</c>'s "authoritative line amount" comment). The
    /// "cannot return more than sold" cross-return cap (script 68) also lives in the handler, since it
    /// requires querying sibling <c>SaleReturn</c> rows this aggregate can't see.
    /// </summary>
    public void AddItem(
        Guid saleItemId, Guid medicineId, decimal quantityReturned, decimal unitPrice, decimal unitCostPrice,
        string reason, PackagingCondition packagingCondition, decimal? lineAmount = null)
    {
        var item = SaleReturnItem.Create(saleItemId, medicineId, quantityReturned, unitPrice, unitCostPrice, reason, packagingCondition, lineAmount);
        item.AssignReturn(Id);
        _items.Add(item);
    }

    /// <summary>Moves to a new status. Completed and Rejected are both terminal: a completed return has
    /// restored stock and posted its voucher; a rejected one has released its quantity back to the sale
    /// line's cap, so re-opening it could take the line past what was sold (record a new return
    /// instead). Stricter than the Next.js RPC (which allowed any transition).</summary>
    public void SetStatus(ReturnStatus status)
    {
        if (Status == ReturnStatus.Rejected && status != ReturnStatus.Rejected)
        {
            throw new CustomException(
                "A rejected return cannot be reopened. Record a new return instead.",
                (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }

        if (Status == ReturnStatus.Completed && status != ReturnStatus.Completed)
        {
            throw new CustomException(
                "A completed return cannot change status.", (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }

        if (Status == ReturnStatus.Rejected && status == ReturnStatus.Completed)
        {
            throw new CustomException(
                "A rejected return cannot be completed.", (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }

        Status = status;
    }

    /// <summary>Stores the VAT breakdown of the returned lines.</summary>
    public void ApplyVatBreakdown(VatBreakdown? breakdown)
    {
        if (breakdown is null)
        {
            return;
        }

        VatRatePercent = breakdown.RatePercent;
        TaxableAmount = breakdown.TaxableAmount;
        VatAmount = breakdown.VatAmount;
        ExemptAmount = breakdown.ExemptAmount;
    }

    /// <summary>Sets the sequential credit-note number and its fiscal year (write-once).</summary>
    public void AssignCreditNote(string creditNoteNumber, int fiscalYear)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(creditNoteNumber);
        if (CreditNoteNumber is not null)
        {
            return;
        }

        CreditNoteNumber = creditNoteNumber.Trim();
        FiscalYear = fiscalYear;
    }

    /// <summary>Records how the return's money went back (once, when it completes).</summary>
    public void RecordSettlement(SaleReversalSettlement settlement)
    {
        ArgumentNullException.ThrowIfNull(settlement);
        SettlementCashAmount = settlement.Cash;
        SettlementBankAmount = settlement.Bank;
        SettlementOnAccountAmount = settlement.OnAccount;
    }

    /// <summary>Updates the free-text reason/notes without touching status — mirrors the Next.js PATCH
    /// schema, which allows these independently of a status change.</summary>
    public void UpdateDetails(string? reason, string? notes)
    {
        if (!string.IsNullOrWhiteSpace(reason))
        {
            ReturnReason = reason.Trim();
        }

        if (notes is not null)
        {
            Notes = notes.Trim();
        }
    }

    /// <summary>Marks stock as restored, exactly once. Returns <c>true</c> the first time (the caller
    /// must then fire <c>ReturnCompletedIntegrationEvent</c>); returns <c>false</c> on a repeat call
    /// (already restored) — the idempotency <c>restore_return_stock</c> provided via its own guard.</summary>
    public bool MarkStockRestoredIfNeeded()
    {
        if (StockRestoredAtUtc is not null)
        {
            return false;
        }

        StockRestoredAtUtc = DateTime.UtcNow;
        return true;
    }
}
