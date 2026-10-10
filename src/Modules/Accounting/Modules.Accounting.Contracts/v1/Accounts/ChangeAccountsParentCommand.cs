using Mediator;

namespace FSH.Modules.Accounting.Contracts.v1.Accounts;

/// <summary>
/// Moves one or more accounts (with their sub-accounts) under <paramref name="TargetParentId"/> in one
/// all-or-nothing change. Moved non-system accounts and their non-system descendants get codes regenerated
/// from the new parent; system accounts keep their code. Returns the number of accounts re-parented.
/// </summary>
public sealed record ChangeAccountsParentCommand(IReadOnlyList<Guid> AccountIds, Guid TargetParentId) : ICommand<int>;
