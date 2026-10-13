using FSH.Modules.Accounting.Contracts.Dtos;
using FSH.Modules.Accounting.Contracts.v1.Reports;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Features.v1.Reports.CashFlow;
using Mediator;

namespace FSH.Modules.Accounting.Features.v1.Reports.GetCashFlowClassifications;

public sealed class GetCashFlowClassificationsQueryHandler(AccountingDbContext dbContext)
    : IQueryHandler<GetCashFlowClassificationsQuery, IReadOnlyList<CashFlowClassificationDto>>
{
    public async ValueTask<IReadOnlyList<CashFlowClassificationDto>> Handle(
        GetCashFlowClassificationsQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);
        var snapshot = await CashFlowClassifications.LoadAsync(dbContext, cancellationToken).ConfigureAwait(false);
        return CashFlowClassifications.ToDtos(snapshot);
    }
}
