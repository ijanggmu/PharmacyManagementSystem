namespace FSH.Modules.Accounting.Contracts.v1.Banking;

/// <summary>One input line at import-creation time. Exactly one of <see cref="DebitAmount"/>
/// (money in) / <see cref="CreditAmount"/> (money out) must be positive.</summary>
public sealed record BankStatementImportLineInput(
    DateTime TxnDateUtc, string? Description, string? Reference, decimal DebitAmount, decimal CreditAmount);
