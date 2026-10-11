using FSH.Modules.Multitenancy.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Multitenancy.Contracts.v1.UpdateBranch;

/// <summary>Replaces the branch name, code, contact details and active state. Null contact fields clear the stored value.</summary>
public sealed record UpdateBranchCommand(
    Guid Id,
    string Name,
    string Code,
    bool IsActive,
    string? Address = null,
    string? Phone = null,
    string? Email = null) : ICommand<BranchDto>;
