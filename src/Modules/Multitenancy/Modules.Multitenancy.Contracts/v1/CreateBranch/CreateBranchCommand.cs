using FSH.Modules.Multitenancy.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Multitenancy.Contracts.v1.CreateBranch;

public sealed record CreateBranchCommand(
    string Name,
    string Code,
    string? Address = null,
    string? Phone = null,
    string? Email = null) : ICommand<BranchDto>;
