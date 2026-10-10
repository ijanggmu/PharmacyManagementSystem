using Mediator;

namespace FSH.Modules.Accounting.Contracts.v1.Banking;

public sealed record CreateBankStatementImportCommand(
    Guid AccountId,
    string? StatementLabel,
    DateTime PeriodStartUtc,
    DateTime PeriodEndUtc,
    decimal? OpeningBalance,
    decimal? ClosingBalance,
    IReadOnlyList<BankStatementImportLineInput> Lines) : ICommand<Guid>;
