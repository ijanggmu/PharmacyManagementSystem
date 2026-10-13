namespace FSH.Modules.Accounting.Contracts.Services;

/// <summary>
/// Stable codes for the standard system chart of accounts seeded by
/// <c>AccountingDbInitializer</c> — other modules map their own postings onto these via
/// <see cref="IAccountingAccountResolver"/> instead of hardcoding magic strings.
/// </summary>
public static class AccountingSystemAccountCodes
{
    public const string Cash = "1000";
    public const string Bank = "1010";
    public const string AccountsReceivable = "1100";

    /// <summary>"Insurance Receivable" — the part of a sale an insurer pays later. Not a customer's account
    /// (it has no subledger), so it stays out of Accounts Receivable; the insurer's settlement is posted
    /// against it (Dr Bank / Cr Insurance Receivable). An odd code so it is unlikely to collide with a
    /// user-created account.</summary>
    public const string InsuranceReceivable = "1190";
    public const string Inventory = "1200";
    public const string AccountsPayable = "2000";
    public const string VatPayable = "2100";

    /// <summary>"TDS Payable" — tax deducted at source (withholding tax) from payments to vendors, owed to IRD
    /// until it is deposited (Dr TDS Payable / Cr Bank). Between VAT Payable 2100 and the next hundred the
    /// account allocator hands out (2200), so it is unlikely to collide with a user-created account.</summary>
    public const string TdsPayable = "2150";

    /// <summary>"Cheques Issued" (PDC payable) — cheques given to suppliers that the bank has not paid yet. A supplier
    /// payment by cheque is posted here (Dr AP / Cr Cheques Issued) and moves out of the bank when the cheque clears
    /// (Dr Cheques Issued / Cr Bank). Next to TDS Payable 2150.</summary>
    public const string ChequesIssued = "2160";
    public const string InputVatRecoverable = "1150";

    /// <summary>"Cheques in Hand" (PDC receivable) — customer cheques received but not yet cleared. A customer receipt
    /// by cheque is posted here, not to the bank (Dr Cheques in Hand / Cr AR), and moves to the bank when the cheque
    /// clears (Dr Bank / Cr Cheques in Hand). Outside the 10xx cash &amp; bank block on purpose: it is not money in the
    /// bank yet. Next to Input VAT 1150, an odd code unlikely to collide with a user-created account.</summary>
    public const string ChequesInHand = "1160";
    public const string OwnersEquity = "3000";

    /// <summary>"Retained Earnings" — receives each closed fiscal year's profit or loss (see the year-end close).
    /// A high code in the Equity block, like <see cref="RoundingOff"/>, so it is unlikely to collide with a
    /// user-created account (those are numbered 3100, 3200, ...).</summary>
    public const string RetainedEarnings = "3900";
    public const string SalesRevenue = "4000";
    public const string SalesReturnsAndAllowances = "4100";
    public const string CostOfGoodsSold = "5000";
    public const string GeneralExpenses = "5100";

    /// <summary>"Cash Short &amp; Over" — absorbs the drawer variance when a cash shift is closed with a
    /// count that differs from the expected cash (a shortage is an expense debit, an overage a credit). In
    /// the Expenses block next to Rounding Off, an odd high code unlikely to collide with a user account.</summary>
    public const string CashShortAndOver = "5980";

    /// <summary>"Rounding Off" — absorbs the sub-paisa residual left when a system voucher's lines are
    /// rounded to 2 decimal places (see <c>VoucherPostingService</c>). An odd, high code in the
    /// Expenses block so it is unlikely to collide with a user-created account.</summary>
    public const string RoundingOff = "5990";
}
