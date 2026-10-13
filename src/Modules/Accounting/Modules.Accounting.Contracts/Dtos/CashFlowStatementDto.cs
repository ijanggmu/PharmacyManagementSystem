namespace FSH.Modules.Accounting.Contracts.Dtos;

/// <summary>One account's contribution to a cash flow line (positive = cash in).</summary>
public sealed record CashFlowAccountAmountDto(Guid AccountId, string AccountCode, string AccountName, decimal Amount);

/// <summary>
/// A cash flow statement line. <c>Key</c> is stable (<c>receivables</c>, <c>inventory</c>, <c>input_vat</c>,
/// <c>other_current_assets</c>, <c>payables</c>, <c>vat_payable</c>, <c>tds_payable</c>,
/// <c>other_current_liabilities</c>, <c>depreciation</c>, <c>reclassified</c>, <c>non_cash_offset</c>, or
/// <c>account:{code}</c> for per-account investing/financing lines). Amount: positive = cash in.
/// </summary>
public sealed record CashFlowLineDto(string Key, string Label, decimal Amount, IReadOnlyList<CashFlowAccountAmountDto> Accounts);

/// <summary>A cash or bank account's balance at the start (after any opening-balance voucher in the period) and end.</summary>
public sealed record CashFlowCashAccountDto(Guid AccountId, string AccountCode, string AccountName, decimal Opening, decimal Closing);

/// <summary>
/// Cash flow statement, indirect method (NAS 7 / IAS 7 layout). Net profit is the period's P&amp;L without year-end
/// closing vouchers; opening-balance vouchers dated inside the period count as part of the opening position.
/// <c>Difference</c> = actual closing cash − (opening cash + net change); zero when every ledger line is classified.
/// </summary>
public sealed record CashFlowStatementDto(
    DateTime FromUtc,
    DateTime ToUtc,
    Guid? BranchId,
    decimal NetProfit,
    IReadOnlyList<CashFlowLineDto> Adjustments,
    IReadOnlyList<CashFlowLineDto> WorkingCapitalChanges,
    decimal NetCashFromOperating,
    IReadOnlyList<CashFlowLineDto> InvestingLines,
    decimal NetCashFromInvesting,
    IReadOnlyList<CashFlowLineDto> FinancingLines,
    decimal NetCashFromFinancing,
    decimal NetChangeInCash,
    decimal OpeningCash,
    decimal ClosingCash,
    decimal Difference,
    bool IsReconciled,
    IReadOnlyList<CashFlowCashAccountDto> CashAccounts);

/// <summary>
/// An account's cash flow classification: its own tag (null = none), the activity it inherits from a tagged
/// ancestor or the built-in default, and the activity in effect. Activities: Operating, Investing, Financing,
/// NonCash; <c>Cash</c> for the 10xx cash and bank accounts (not taggable).
/// </summary>
public sealed record CashFlowClassificationDto(
    Guid AccountId,
    string AccountCode,
    string AccountName,
    string AccountType,
    Guid? ParentId,
    bool IsPostable,
    string? Tag,
    string DefaultActivity,
    string EffectiveActivity);
