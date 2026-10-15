using FSH.Modules.Accounting.Contracts.Dtos;
using FSH.Modules.Accounting.Contracts.v1.Reports;
using FSH.Modules.Accounting.Domain;
using FSH.Modules.Inventory.Contracts.v1.Reports;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Prescriptions.Contracts.v1.Reports;
using FSH.Modules.Sales.Contracts.v1.Sales;
using Mediator;

namespace FSH.Modules.Accounting.Features.v1.Reports.GetReportsOverview;

/// <summary>
/// Composes the reports overview KPIs entirely from other modules' already-ported queries (via
/// <c>IMediator</c>) plus this module's own trial balance — no direct DbContext access to another
/// module, per the module-boundary rule. See <see cref="ReportsOverviewDto"/> remarks.
/// </summary>
public sealed class GetReportsOverviewQueryHandler(IMediator mediator, ICurrentBranch currentBranch)
    : IQueryHandler<GetReportsOverviewQuery, ReportsOverviewDto>
{
    public async ValueTask<ReportsOverviewDto> Handle(GetReportsOverviewQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        // Every KPI on the page uses one branch scope (ViewAll callers pick a branch or all; others get
        // theirs), so the figures agree with the branch-filtered rows shown next to them.
        Guid? branchId = await currentBranch.ResolveListBranchFilterAsync(query.BranchId, cancellationToken).ConfigureAwait(false);

        var salesStats = await mediator.Send(new GetSalesStatsQuery(query.FromUtc, query.ToUtc, branchId), cancellationToken)
            .ConfigureAwait(false);
        decimal stockValuation = await mediator.Send(new GetStockValuationQuery(branchId), cancellationToken)
            .ConfigureAwait(false);
        var inventoryDiscrepancy = await mediator.Send(new GetInventoryDiscrepancyReportQuery(), cancellationToken)
            .ConfigureAwait(false);
        var prescriptionStats = await mediator.Send(new GetPrescriptionStatsQuery(), cancellationToken)
            .ConfigureAwait(false);
        var trialBalance = await mediator.Send(new GetTrialBalanceQuery(query.ToUtc, branchId), cancellationToken)
            .ConfigureAwait(false);

        return new ReportsOverviewDto(
            query.FromUtc,
            query.ToUtc,
            DateTime.UtcNow,
            salesStats.SaleCount,
            // Money to the paisa (line-level sums from Sales and Inventory carry more decimals).
            AccountingVoucher.RoundAmount(salesStats.TotalRevenue),
            AccountingVoucher.RoundAmount(salesStats.TotalDiscount),
            AccountingVoucher.RoundAmount(salesStats.AverageSaleAmount),
            AccountingVoucher.RoundAmount(stockValuation),
            inventoryDiscrepancy.TotalMedicines,
            inventoryDiscrepancy.LowStockCount,
            prescriptionStats.Total,
            prescriptionStats.Pending,
            prescriptionStats.PartiallyFilled,
            prescriptionStats.Filled,
            prescriptionStats.Cancelled,
            trialBalance.Sum(l => l.TotalDebit),
            trialBalance.Sum(l => l.TotalCredit));
    }
}
