using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Sales.Contracts.Dtos;
using FSH.Modules.Sales.Contracts.v1.Refunds;
using FSH.Modules.Sales.Data;
using FSH.Modules.Sales.Domain;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Sales.Features.v1.Refunds.GetRefundsStats;

/// <summary>Counts by <see cref="RefundStatus"/> plus the net amount actually paid back: completed refunds
/// only, since a pending, approved or rejected refund has paid nothing out. No date-range filter.
/// <see cref="SaleRefund.NetRefundAmount"/> is a computed property (items total + tax -
/// processing fee, not a persisted column), so items must be loaded before it can be summed — same
/// tradeoff SearchRefundsQueryHandler already makes for its amount-range filter.</summary>
public sealed class GetRefundsStatsQueryHandler(SalesDbContext dbContext, ICurrentBranch currentBranch)
    : IQueryHandler<GetRefundsStatsQuery, RefundsStatsDto>
{
    public async ValueTask<RefundsStatsDto> Handle(GetRefundsStatsQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        // Same scope as the refunds list: ViewAll callers pick a branch or all; others get theirs.
        Guid? branchId = await currentBranch.ResolveListBranchFilterAsync(query.BranchId, cancellationToken).ConfigureAwait(false);

        var refunds = await dbContext.SaleRefunds
            .AsNoTracking()
            .Where(r => branchId == null || r.BranchId == branchId)
            .Include(r => r.Items)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        int CountBy(RefundStatus status) => refunds.Count(r => r.Status == status);

        return new RefundsStatsDto(
            refunds.Count,
            refunds.Where(r => r.Status == RefundStatus.Completed).Sum(r => r.NetRefundAmount),
            CountBy(RefundStatus.Pending),
            CountBy(RefundStatus.Approved),
            CountBy(RefundStatus.Rejected),
            CountBy(RefundStatus.Completed));
    }
}
