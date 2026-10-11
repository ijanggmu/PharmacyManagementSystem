using FSH.Modules.Accounting.Contracts.Dtos;
using FSH.Modules.Accounting.Contracts.v1.OpeningBalances;
using FSH.Modules.Accounting.Services;
using Mediator;

namespace FSH.Modules.Accounting.Features.v1.OpeningBalances.GetOpeningBalances;

public sealed class GetOpeningBalancesQueryHandler(OpeningBalanceService openingBalances)
    : IQueryHandler<GetOpeningBalancesQuery, OpeningBalanceStateDto>
{
    public async ValueTask<OpeningBalanceStateDto> Handle(GetOpeningBalancesQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);
        return await openingBalances.GetStateAsync(query.BranchId, cancellationToken).ConfigureAwait(false);
    }
}
