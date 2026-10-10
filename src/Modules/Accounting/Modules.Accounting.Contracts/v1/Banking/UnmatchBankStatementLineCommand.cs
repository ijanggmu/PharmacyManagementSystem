using Mediator;

namespace FSH.Modules.Accounting.Contracts.v1.Banking;

public sealed record UnmatchBankStatementLineCommand(Guid LineId) : ICommand<Guid>;
