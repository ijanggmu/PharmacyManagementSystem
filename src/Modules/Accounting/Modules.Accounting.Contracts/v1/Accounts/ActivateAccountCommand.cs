using Mediator;

namespace FSH.Modules.Accounting.Contracts.v1.Accounts;

public sealed record ActivateAccountCommand(Guid AccountId) : ICommand<Guid>;
