using FSH.Modules.Accounting.Contracts.Dtos;
using FSH.Modules.Accounting.Contracts.v1.FiscalYears;
using FSH.Modules.Accounting.Services;
using Mediator;

namespace FSH.Modules.Accounting.Features.v1.FiscalYears.GetFiscalYears;

public sealed class GetFiscalYearsQueryHandler(FiscalYearCloseService fiscalYears)
    : IQueryHandler<GetFiscalYearsQuery, IReadOnlyList<FiscalYearStatusDto>>
{
    public async ValueTask<IReadOnlyList<FiscalYearStatusDto>> Handle(GetFiscalYearsQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);
        return await fiscalYears.ListAsync(cancellationToken).ConfigureAwait(false);
    }
}
