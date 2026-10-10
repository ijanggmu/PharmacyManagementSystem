using Mediator;

namespace FSH.Modules.Accounting.Contracts.v1.Accounts;

public sealed record UpdateAccountCommand(Guid AccountId, string Name) : ICommand<Guid>;
