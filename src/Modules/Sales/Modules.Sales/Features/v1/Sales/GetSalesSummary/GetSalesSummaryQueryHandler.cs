using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Sales.Contracts.Dtos;
using FSH.Modules.Sales.Contracts.v1.Sales;
using FSH.Modules.Sales.Data;
using FSH.Modules.Sales.Domain;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Sales.Features.v1.Sales.GetSalesSummary;

/// <summary>
/// Mirrors the legacy <c>getSalesStatsForTenant</c>: counts and sums over every sale row in the
/// current branch. Cancelled sales are left out of the totals and counted in <c>CancelledCount</c>.
/// </summary>
public sealed class GetSalesSummaryQueryHandler(SalesDbContext dbContext, ICurrentBranch currentBranch)
    : IQueryHandler<GetSalesSummaryQuery, SalesSummaryDto>
{
    public async ValueTask<SalesSummaryDto> Handle(GetSalesSummaryQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        DateTime todayStart = query.TodayStartUtc ?? DateTime.SpecifyKind(DateTime.UtcNow.Date, DateTimeKind.Utc);

        var scoped = dbContext.Sales.AsNoTracking().AsQueryable();

        var branchId = await currentBranch.GetListFilterBranchIdAsync(cancellationToken).ConfigureAwait(false);
        if (branchId is { } scopedBranchId)
        {
            scoped = scoped.Where(s => s.BranchId == scopedBranchId);
        }

        int cancelledCount = await scoped
            .CountAsync(s => s.Status == SaleStatus.Cancelled, cancellationToken)
            .ConfigureAwait(false);

        var sales = await scoped
            .Where(s => s.Status != SaleStatus.Cancelled)
            .Include(s => s.Items)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        var today = sales.Where(s => s.SaleDateUtc >= todayStart).ToList();

        return new SalesSummaryDto(
            Total: sales.Count,
            TotalRevenue: sales.Sum(s => s.TotalAmount),
            TodaySales: today.Count,
            TodayRevenue: today.Sum(s => s.TotalAmount),
            PendingPayments: sales.Count(s => s.BalanceDue > 0m),
            CompletedPayments: sales.Count(s => s.BalanceDue <= 0m),
            CancelledCount: cancelledCount);
    }
}
