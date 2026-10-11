using FSH.Modules.Multitenancy.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Multitenancy.Contracts.v1.SwitchBranch;

/// <summary>
/// Updates the caller's current-branch selection to <paramref name="BranchId"/> and returns the
/// refreshed branch context. The target branch must belong to the caller's tenant and be active.
/// </summary>
public sealed record SwitchBranchCommand(Guid BranchId) : ICommand<BranchContextDto>;
