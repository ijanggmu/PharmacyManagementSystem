using Mediator;

namespace FSH.Modules.Accounting.Contracts.v1.Accounts;

/// <summary>
/// Creates an account under <paramref name="ParentId"/> (a root head or a group/ledger account). The code
/// is generated from the parent (see <c>AccountCodeAllocator</c>) and the head (account type) is inherited.
/// </summary>
public sealed record CreateAccountCommand(Guid ParentId, string Name) : ICommand<Guid>;
