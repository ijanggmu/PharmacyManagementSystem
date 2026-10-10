using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Multitenancy.Contracts.Dtos;
using FSH.Modules.Multitenancy.Contracts.v1.CreateBranch;
using Mediator;

namespace FSH.Modules.Multitenancy.Features.v1.CreateBranch;

public sealed class CreateBranchCommandHandler(IBranchService branchService)
    : ICommandHandler<CreateBranchCommand, BranchDto>
{
    public async ValueTask<BranchDto> Handle(CreateBranchCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        return await branchService
            .CreateAsync(command.Name, command.Code, command.Address, command.Phone, command.Email, cancellationToken)
            .ConfigureAwait(false);
    }
}
