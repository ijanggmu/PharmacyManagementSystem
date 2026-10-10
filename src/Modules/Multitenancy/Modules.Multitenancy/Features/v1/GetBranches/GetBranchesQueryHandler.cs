using FSH.Framework.Shared.Persistence;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Multitenancy.Contracts.Dtos;
using FSH.Modules.Multitenancy.Contracts.v1.GetBranches;
using Mediator;

namespace FSH.Modules.Multitenancy.Features.v1.GetBranches;

public sealed class GetBranchesQueryHandler(IBranchService branchService)
    : IQueryHandler<GetBranchesQuery, PagedResponse<BranchDto>>
{
    public async ValueTask<PagedResponse<BranchDto>> Handle(GetBranchesQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        return await branchService.GetAllAsync(query, cancellationToken).ConfigureAwait(false);
    }
}
