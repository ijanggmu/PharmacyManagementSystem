using FSH.Modules.Accounting.Contracts.Dtos;
using FSH.Modules.Accounting.Contracts.v1.OpeningBalances;
using FSH.Modules.Accounting.Services;
using Mediator;

namespace FSH.Modules.Accounting.Features.v1.OpeningBalances.EditOpeningBalances;

public sealed class EditOpeningBalancesCommandHandler(OpeningBalanceService openingBalances)
    : ICommandHandler<EditOpeningBalancesCommand, OpeningBalanceMutationResultDto>
{
    public async ValueTask<OpeningBalanceMutationResultDto> Handle(EditOpeningBalancesCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);
        return await openingBalances.EditAsync(command, cancellationToken).ConfigureAwait(false);
    }
}
