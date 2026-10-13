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
    public const string Inventory = "1200";
    public const string AccountsPayable = "2000";
    public const string VatPayable = "2100";
    public const string InputVatRecoverable = "1150";
    public const string OwnersEquity = "3000";

    /// <summary>"Retained Earnings" — receives each closed fiscal year's profit or loss (see the year-end close).
    /// A high code in the Equity block, like <see cref="RoundingOff"/>, so it is unlikely to collide with a
    /// user-created account (those are numbered 3100, 3200, ...).</summary>
    public const string RetainedEarnings = "3900";
    public const string SalesRevenue = "4000";
    public const string SalesReturnsAndAllowances = "4100";
    public const string CostOfGoodsSold = "5000";
    public const string GeneralExpenses = "5100";

    /// <summary>"Rounding Off" — absorbs the sub-paisa residual left when a system voucher's lines are
    /// rounded to 2 decimal places (see <c>VoucherPostingService</c>). An odd, high code in the
    /// Expenses block so it is unlikely to collide with a user-created account.</summary>
    public const string RoundingOff = "5990";
}
