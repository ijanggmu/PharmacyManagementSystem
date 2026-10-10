using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Identity.Contracts.Services;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Multitenancy.Contracts.Dtos;
using FSH.Modules.Multitenancy.Contracts.v1.SwitchBranch;
using Mediator;

namespace FSH.Modules.Multitenancy.Features.v1.SwitchBranch;

public sealed class SwitchBranchCommandHandler(
    IBranchService branchService,
    IUserProfileService userProfileService,
    ICurrentUser currentUser,
    ICurrentBranch currentBranch) : ICommandHandler<SwitchBranchCommand, BranchContextDto>
{
    public async ValueTask<BranchContextDto> Handle(SwitchBranchCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        // Without Branches.ViewAll a user is confined to their assigned branch; only an administrator
        // (via the user update path) can move them. Re-selecting their own branch stays a no-op success.
        if (!await currentBranch.CanViewAllBranchesAsync(cancellationToken).ConfigureAwait(false))
        {
            var ownBranchId = await currentBranch.GetBranchIdAsync(cancellationToken).ConfigureAwait(false);
            if (ownBranchId != command.BranchId)
            {
                throw new ForbiddenException(
                    "You can only work in your assigned branch. Ask an administrator to change your branch or grant 'View all branches' access.");
            }
        }

        var isValidBranch = await branchService
            .IsActiveBranchOfCurrentTenantAsync(command.BranchId, cancellationToken)
            .ConfigureAwait(false);

        if (!isValidBranch)
        {
            throw new NotFoundException($"Branch {command.BranchId} not found for the current tenant, or is inactive.");
        }

        var userId = currentUser.GetUserId().ToString();
        await userProfileService.SetCurrentBranchIdAsync(userId, command.BranchId, cancellationToken).ConfigureAwait(false);

        var branches = await branchService.GetAllForCurrentTenantAsync(cancellationToken).ConfigureAwait(false);

        return new BranchContextDto
        {
            Branches = [.. branches],
            CurrentBranchId = command.BranchId
        };
    }
}
