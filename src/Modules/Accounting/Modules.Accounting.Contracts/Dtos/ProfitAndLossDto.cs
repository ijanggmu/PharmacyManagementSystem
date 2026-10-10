namespace FSH.Modules.Accounting.Contracts.Dtos;

public sealed record ProfitAndLossDto(
    DateTime FromUtc,
    DateTime ToUtc,
    IReadOnlyList<TrialBalanceLineDto> RevenueLines,
    decimal TotalRevenue,
    IReadOnlyList<TrialBalanceLineDto> ExpenseLines,
    decimal TotalExpense,
    decimal NetIncome);
