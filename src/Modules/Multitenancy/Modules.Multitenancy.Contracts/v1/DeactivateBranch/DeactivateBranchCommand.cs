using FSH.Modules.Multitenancy.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Multitenancy.Contracts.v1.DeactivateBranch;

/// <summary>Soft-deactivates a branch (IsActive = false). Refused for the tenant's default branch and for the last active branch.</summary>
public sealed record DeactivateBranchCommand(Guid Id) : ICommand<BranchDto>;
