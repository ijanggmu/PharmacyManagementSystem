namespace FSH.Modules.Accounting.Contracts.v1.OpeningBalances;

/// <summary>One account's opening balance as entered. Exactly one side must be greater than zero.</summary>
public sealed record OpeningBalanceLineInput(Guid AccountId, decimal DebitAmount, decimal CreditAmount);
