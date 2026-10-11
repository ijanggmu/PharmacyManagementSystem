using Mediator;

namespace FSH.Modules.Accounting.Contracts.v1.Banking;

public sealed record ReconcileBankAccountCommand(DateTime AsOfUtc, decimal StatementBalance, string? Notes = null) : ICommand<Guid>;
