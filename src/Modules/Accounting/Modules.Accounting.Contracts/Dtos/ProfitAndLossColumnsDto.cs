namespace FSH.Modules.Accounting.Contracts.Dtos;

/// <summary>A period column of a multi-period P&amp;L, with its totals.</summary>
public sealed record ProfitAndLossColumnDto(DateTime FromUtc, DateTime ToUtc, decimal TotalRevenue, decimal TotalExpense, decimal NetIncome);

/// <summary>A revenue or expense account with one amount per column (revenue credit-normal, expense debit-normal).</summary>
public sealed record ProfitAndLossColumnsLineDto(
    Guid AccountId,
    string AccountCode,
    string AccountName,
    string AccountType,
    IReadOnlyList<decimal> Amounts);

/// <summary>P&amp;L for several periods side by side — comparatives and the monthly trend. Every column follows the
/// same rules as <c>GetProfitAndLoss</c> (year-end closing vouchers excluded).</summary>
public sealed record ProfitAndLossColumnsDto(
    Guid? BranchId,
    IReadOnlyList<ProfitAndLossColumnDto> Columns,
    IReadOnlyList<ProfitAndLossColumnsLineDto> Lines);
