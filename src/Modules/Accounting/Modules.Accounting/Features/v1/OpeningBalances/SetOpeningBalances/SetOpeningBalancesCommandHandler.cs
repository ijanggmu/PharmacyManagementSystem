using FSH.Modules.Accounting.Contracts.Dtos;
using FSH.Modules.Accounting.Contracts.v1.OpeningBalances;
using FSH.Modules.Accounting.Services;
using Mediator;

namespace FSH.Modules.Accounting.Features.v1.OpeningBalances.SetOpeningBalances;

public sealed class SetOpeningBalancesCommandHandler(OpeningBalanceService openingBalances)
    : ICommandHandler<SetOpeningBalancesCommand, OpeningBalanceMutationResultDto>
{
    public async ValueTask<OpeningBalanceMutationResultDto> Handle(SetOpeningBalancesCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);
        return await openingBalances.SetAsync(command, cancellationToken).ConfigureAwait(false);
    }
}
