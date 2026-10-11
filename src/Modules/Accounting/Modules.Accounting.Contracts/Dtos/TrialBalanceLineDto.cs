namespace FSH.Modules.Accounting.Contracts.Dtos;

public sealed record TrialBalanceLineDto(
    Guid AccountId,
    string AccountCode,
    string AccountName,
    string AccountType,
    decimal TotalDebit,
    decimal TotalCredit,
    decimal NetBalance);
