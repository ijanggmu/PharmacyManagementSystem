using FSH.Framework.Core.Context;
using FSH.Modules.Identity.Contracts.Services;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Multitenancy.Contracts.Dtos;
using FSH.Modules.Multitenancy.Contracts.v1.GetBranchContext;
using Mediator;

namespace FSH.Modules.Multitenancy.Features.v1.GetBranchContext;

/// <summary>
/// Composes the branch-context response from two modules: the tenant's branch list
/// (<see cref="IBranchService"/>, owned here) and the caller's current-branch selection
/// (<see cref="IUserProfileService"/>, owned by Modules.Identity — a loose <c>Guid?</c> on
/// <c>FshUser</c> with no FK, since Branch lives in a different database).
/// </summary>
public sealed class GetBranchContextQueryHandler(
    IBranchService branchService,
    IUserProfileService userProfileService,
    ICurrentUser currentUser) : IQueryHandler<GetBranchContextQuery, BranchContextDto>
{
    public async ValueTask<BranchContextDto> Handle(GetBranchContextQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        var branches = await branchService.GetAllForCurrentTenantAsync(cancellationToken).ConfigureAwait(false);
        var userId = currentUser.GetUserId().ToString();
        var currentBranchId = await userProfileService.GetCurrentBranchIdAsync(userId, cancellationToken).ConfigureAwait(false);

        return new BranchContextDto
        {
            Branches = [.. branches],
            CurrentBranchId = currentBranchId
        };
    }
}
