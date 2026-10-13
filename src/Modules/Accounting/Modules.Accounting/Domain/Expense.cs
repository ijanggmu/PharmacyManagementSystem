using FSH.Framework.Core.Domain;

namespace FSH.Modules.Accounting.Domain;

/// <summary>
/// A recorded business expense. Posts a system voucher at the same time it's recorded — see
/// <c>RecordExpenseCommandHandler</c>: Dr the chosen expense account (net of VAT) + Dr Input VAT Recoverable
/// (<see cref="VatAmount"/>, on a VAT bill) / Cr Cash or Bank (paid now, per <see cref="PaymentMethod"/>) or
/// Cr Accounts Payable (pay later, <see cref="SupplierId"/> set). <see cref="Amount"/> is always the gross bill
/// total. With TDS withheld (<see cref="TdsAmount"/> &gt; 0) the vendor is paid / owed only
/// <see cref="PayableAmount"/> (gross − TDS) and the TDS is credited to TDS Payable (2150) until it is deposited
/// with IRD. TDS is computed on <see cref="NetAmount"/> (the bill excluding VAT).
/// </summary>
public sealed class Expense : AggregateRoot<Guid>
{
    /// <summary><see cref="PaymentMethod"/> stored on a pay-later expense: nothing was paid when it was recorded.</summary>
    public const string CreditPaymentMethod = "credit";

    public DateTime ExpenseDateUtc { get; private set; }

    /// <summary>A free-text label (rent, utilities, …). The GL account is <see cref="ExpenseAccountId"/>.</summary>
    public string Category { get; private set; } = default!;

    /// <summary>Gross bill total (VAT included): what was paid, or for a pay-later expense what is owed.</summary>
    public decimal Amount { get; private set; }
    public string PaymentMethod { get; private set; } = default!;
    public string? Description { get; private set; }

    /// <summary>Supplier bill / receipt number the expense was paid against, for audit lookups. Optional, except
    /// on a VAT bill (the input VAT claim needs it).</summary>
    public string? ReceiptReference { get; private set; }
    public string RecordedBy { get; private set; } = default!;
    public DateTime CreatedAtUtc { get; private set; }
    public DateTime? UpdatedAtUtc { get; private set; }

    /// <summary>Nullable — "NULL = legacy/tenant-wide" per docs/branch-scoping-plan.md §2, sourced via
    /// <c>ICurrentBranch.GetBranchIdAsync()</c>.</summary>
    public Guid? BranchId { get; private set; }

    /// <summary>The Expense-type ledger account the net cost is booked to. Null on expenses recorded before the
    /// account could be chosen — those post to General Expenses (5100).</summary>
    public Guid? ExpenseAccountId { get; private set; }

    /// <summary>Input VAT included in <see cref="Amount"/> (a VAT bill), booked to Input VAT Recoverable (1150).
    /// Zero for a non-VAT expense.</summary>
    public decimal VatAmount { get; private set; }

    /// <summary>The seller's PAN / VAT registration number printed on the VAT bill.</summary>
    public string? SupplierVatNumber { get; private set; }

    /// <summary>Who the expense was paid or is owed to (free text; the supplier's name on a pay-later expense).</summary>
    public string? VendorName { get; private set; }

    /// <summary>Set on a pay-later expense: the bill is owed to this supplier (Cr Accounts Payable, plus a bill on
    /// the supplier's AP ledger). Null when it was paid at once.</summary>
    public Guid? SupplierId { get; private set; }

    /// <summary>TDS category code withheld under (rent, service_vat, …); null when no TDS was withheld.</summary>
    public string? TdsCategoryCode { get; private set; }

    /// <summary>The category's name when the TDS was withheld (a snapshot for lists and narrations).</summary>
    public string? TdsCategoryName { get; private set; }

    /// <summary>The TDS rate used, in percent; null without TDS.</summary>
    public decimal? TdsRatePercent { get; private set; }

    /// <summary>TDS withheld from the vendor (credited to TDS Payable). Zero without TDS.</summary>
    public decimal TdsAmount { get; private set; }

    /// <summary>Amount net of VAT — the figure booked to the expense account, and the TDS base.</summary>
    public decimal NetAmount => Amount - VatAmount;

    /// <summary>What the vendor is paid (paid now) or is owed (pay later): the gross amount less TDS withheld.</summary>
    public decimal PayableAmount => Amount - TdsAmount;

    /// <summary>The TDS withheld on this expense, or null.</summary>
    public TdsWithholding? Tds => TdsAmount > 0 && TdsCategoryCode is not null
        ? new TdsWithholding(TdsCategoryCode, TdsCategoryName ?? TdsCategoryCode, TdsRatePercent ?? 0m, NetAmount, TdsAmount)
        : null;

    public bool IsOnCredit => SupplierId is not null;

    private Expense() { }

    public static Expense Create(
        DateTime expenseDateUtc, string category, decimal amount, string paymentMethod, string? description, string recordedBy, Guid? branchId = null,
        string? receiptReference = null, Guid? expenseAccountId = null, decimal vatAmount = 0m, string? supplierVatNumber = null,
        string? vendorName = null, Guid? supplierId = null, TdsWithholding? tds = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(category);
        ArgumentException.ThrowIfNullOrWhiteSpace(recordedBy);
        EnsureAmounts(amount, vatAmount, tds);
        string method = CreditPaymentMethod;
        if (supplierId is null)
        {
            ArgumentException.ThrowIfNullOrWhiteSpace(paymentMethod);
            method = paymentMethod.Trim();
        }

        var expense = new Expense
        {
            Id = Guid.CreateVersion7(),
            ExpenseDateUtc = expenseDateUtc,
            Category = category.Trim(),
            Amount = amount,
            PaymentMethod = method,
            Description = description?.Trim(),
            RecordedBy = recordedBy.Trim(),
            ReceiptReference = NormalizeText(receiptReference),
            CreatedAtUtc = DateTime.UtcNow,
            BranchId = branchId,
            ExpenseAccountId = expenseAccountId,
            VatAmount = vatAmount,
            SupplierVatNumber = NormalizeText(supplierVatNumber),
            VendorName = NormalizeText(vendorName),
            SupplierId = supplierId,
        };
        expense.ApplyTds(tds);
        return expense;
    }

    /// <summary>Updates the recorded fields. The caller (handler) is responsible for reversing the
    /// original GL voucher and posting a new one to match — this only mutates the expense row
    /// itself (rule.md §9.1: no direct edits to posted vouchers). A pay-later expense keeps its supplier, its
    /// "credit" payment method and (when none is given) its vendor name; the handler refuses edits that would
    /// move the payable.</summary>
    public void Update(
        string category, decimal amount, string paymentMethod, string? description, string? receiptReference = null,
        Guid? expenseAccountId = null, decimal vatAmount = 0m, string? supplierVatNumber = null, string? vendorName = null,
        TdsWithholding? tds = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(category);
        EnsureAmounts(amount, vatAmount, tds);
        if (!IsOnCredit)
        {
            ArgumentException.ThrowIfNullOrWhiteSpace(paymentMethod);
            PaymentMethod = paymentMethod.Trim();
        }

        Category = category.Trim();
        Amount = amount;
        Description = description?.Trim();
        ReceiptReference = NormalizeText(receiptReference);
        ExpenseAccountId = expenseAccountId;
        VatAmount = vatAmount;
        SupplierVatNumber = NormalizeText(supplierVatNumber);
        if (!IsOnCredit || !string.IsNullOrWhiteSpace(vendorName))
        {
            VendorName = NormalizeText(vendorName);
        }

        ApplyTds(tds);
        UpdatedAtUtc = DateTime.UtcNow;
    }

    /// <summary>Moves the expense to another date. The caller reverses the old voucher and posts the
    /// replacement at the new date.</summary>
    public void MoveTo(DateTime expenseDateUtc)
    {
        ExpenseDateUtc = expenseDateUtc;
        UpdatedAtUtc = DateTime.UtcNow;
    }

    private void ApplyTds(TdsWithholding? tds)
    {
        if (tds is not { Amount: > 0 } withheld)
        {
            TdsCategoryCode = null;
            TdsCategoryName = null;
            TdsRatePercent = null;
            TdsAmount = 0m;
            return;
        }

        TdsCategoryCode = withheld.CategoryCode;
        TdsCategoryName = withheld.CategoryName;
        TdsRatePercent = withheld.RatePercent;
        TdsAmount = withheld.Amount;
    }

    private static void EnsureAmounts(decimal amount, decimal vatAmount, TdsWithholding? tds)
    {
        if (amount <= 0)
        {
            throw new ArgumentOutOfRangeException(nameof(amount), "Expense amount must be positive.");
        }

        if (vatAmount < 0 || vatAmount >= amount)
        {
            throw new ArgumentOutOfRangeException(nameof(vatAmount), "VAT must be zero or more and less than the expense amount.");
        }

        // TDS is withheld from the amount excluding VAT, so it can never exceed it.
        if (tds is not null && (tds.Amount < 0 || tds.Amount > amount - vatAmount))
        {
            throw new ArgumentOutOfRangeException(nameof(tds), "TDS must be zero or more and not more than the expense amount excluding VAT.");
        }
    }

    private static string? NormalizeText(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
