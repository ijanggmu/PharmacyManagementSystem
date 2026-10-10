using Mediator;

namespace FSH.Modules.Accounting.Contracts.v1.Accounts;

public sealed record DeactivateAccountCommand(Guid AccountId) : ICommand<Guid>;
