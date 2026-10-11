using FSH.Modules.Multitenancy.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Multitenancy.Contracts.v1.GetBranchById;

public sealed record GetBranchByIdQuery(Guid Id) : IQuery<BranchDto>;
