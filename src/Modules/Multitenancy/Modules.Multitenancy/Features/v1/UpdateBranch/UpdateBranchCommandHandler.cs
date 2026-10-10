using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Multitenancy.Contracts.Dtos;
using FSH.Modules.Multitenancy.Contracts.v1.UpdateBranch;
using Mediator;

namespace FSH.Modules.Multitenancy.Features.v1.UpdateBranch;

public sealed class UpdateBranchCommandHandler(IBranchService branchService)
    : ICommandHandler<UpdateBranchCommand, BranchDto>
{
    public async ValueTask<BranchDto> Handle(UpdateBranchCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        return await branchService
            .UpdateAsync(command.Id, command.Name, command.Code, command.IsActive, command.Address, command.Phone, command.Email, cancellationToken)
            .ConfigureAwait(false);
    }
}
