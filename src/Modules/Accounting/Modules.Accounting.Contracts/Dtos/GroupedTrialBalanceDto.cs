namespace FSH.Modules.Accounting.Contracts.Dtos;

/// <summary>One account-type group (Asset, Liability, Equity, Revenue, Expense) of the grouped
/// trial balance, with its member accounts and rolled-up totals.</summary>
public sealed record GroupedTrialBalanceLineDto(
    string AccountType,
    decimal TotalDebit,
    decimal TotalCredit,
    decimal NetBalance,
    IReadOnlyList<TrialBalanceLineDto> Accounts);
