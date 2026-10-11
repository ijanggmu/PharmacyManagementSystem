using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Multitenancy.Contracts.Dtos;
using FSH.Modules.Multitenancy.Contracts.v1.GetBranchById;
using Mediator;

namespace FSH.Modules.Multitenancy.Features.v1.GetBranchById;

public sealed class GetBranchByIdQueryHandler(IBranchService branchService)
    : IQueryHandler<GetBranchByIdQuery, BranchDto>
{
    public async ValueTask<BranchDto> Handle(GetBranchByIdQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        return await branchService.GetByIdAsync(query.Id, cancellationToken).ConfigureAwait(false);
    }
}
