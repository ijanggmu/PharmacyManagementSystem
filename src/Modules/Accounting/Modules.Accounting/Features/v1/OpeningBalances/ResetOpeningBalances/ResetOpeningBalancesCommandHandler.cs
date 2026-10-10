using FSH.Modules.Accounting.Contracts.Dtos;
using FSH.Modules.Accounting.Contracts.v1.OpeningBalances;
using FSH.Modules.Accounting.Services;
using Mediator;

namespace FSH.Modules.Accounting.Features.v1.OpeningBalances.ResetOpeningBalances;

public sealed class ResetOpeningBalancesCommandHandler(OpeningBalanceService openingBalances)
    : ICommandHandler<ResetOpeningBalancesCommand, OpeningBalanceMutationResultDto>
{
    public async ValueTask<OpeningBalanceMutationResultDto> Handle(ResetOpeningBalancesCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);
        return await openingBalances.ResetAsync(command, cancellationToken).ConfigureAwait(false);
    }
}
