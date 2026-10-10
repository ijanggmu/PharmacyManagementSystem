using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Multitenancy.Contracts.Dtos;
using FSH.Modules.Multitenancy.Contracts.v1.DeactivateBranch;
using Mediator;

namespace FSH.Modules.Multitenancy.Features.v1.DeactivateBranch;

public sealed class DeactivateBranchCommandHandler(IBranchService branchService)
    : ICommandHandler<DeactivateBranchCommand, BranchDto>
{
    public async ValueTask<BranchDto> Handle(DeactivateBranchCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        return await branchService.DeactivateAsync(command.Id, cancellationToken).ConfigureAwait(false);
    }
}
