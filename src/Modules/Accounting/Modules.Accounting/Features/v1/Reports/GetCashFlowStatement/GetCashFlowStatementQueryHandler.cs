using FSH.Modules.Accounting.Contracts.Dtos;
using FSH.Modules.Accounting.Contracts.v1.Reports;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Features.v1.Reports.CashFlow;
using Mediator;

namespace FSH.Modules.Accounting.Features.v1.Reports.GetCashFlowStatement;

/// <summary>
/// Cash flow statement (indirect method) from the period trial balance — the same ledger, branch scope and
/// opening/year-end-close split as every other period report — and the chart's cash flow classification
/// (<see cref="CashFlowClassifier"/>). See <see cref="CashFlowStatementBuilder"/> for the arithmetic.
/// </summary>
public sealed class GetCashFlowStatementQueryHandler(AccountingDbContext dbContext, IMediator mediator)
    : IQueryHandler<GetCashFlowStatementQuery, CashFlowStatementDto>
{
    public async ValueTask<CashFlowStatementDto> Handle(GetCashFlowStatementQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        PeriodTrialBalanceDto trialBalance = await mediator
            .Send(new GetPeriodTrialBalanceQuery(query.FromUtc, query.ToUtc, query.BranchId), cancellationToken)
            .ConfigureAwait(false);
        var snapshot = await CashFlowClassifications.LoadAsync(dbContext, cancellationToken).ConfigureAwait(false);

        return CashFlowStatementBuilder.Build(trialBalance, snapshot.Classes);
    }
}
