using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Sales.Contracts.Dtos;
using FSH.Modules.Sales.Contracts.v1.Returns;
using FSH.Modules.Sales.Data;
using FSH.Modules.Sales.Domain;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Sales.Features.v1.Returns.GetReturnsStats;

/// <summary>Mirrors <c>getReturnsStatsForTenant</c> (Next.js): counts by <see cref="ReturnStatus"/>
/// plus the total return amount, across ALL of the tenant's returns (no date-range filter in the
/// source). <see cref="SaleReturn.TotalReturnAmount"/> is a computed property (sum of item lines,
/// not a persisted column), so items must be loaded before it can be summed — same tradeoff
/// SearchReturnsQueryHandler already makes for its amount-range filter.</summary>
public sealed class GetReturnsStatsQueryHandler(SalesDbContext dbContext, ICurrentBranch currentBranch)
    : IQueryHandler<GetReturnsStatsQuery, ReturnsStatsDto>
{
    public async ValueTask<ReturnsStatsDto> Handle(GetReturnsStatsQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        // Same scope as the returns list: ViewAll callers pick a branch or all; others get theirs.
        Guid? branchId = await currentBranch.ResolveListBranchFilterAsync(query.BranchId, cancellationToken).ConfigureAwait(false);

        var returns = await dbContext.SaleReturns
            .AsNoTracking()
            .Where(r => branchId == null || r.BranchId == branchId)
            .Include(r => r.Items)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        int CountBy(ReturnStatus status) => returns.Count(r => r.Status == status);

        return new ReturnsStatsDto(
            returns.Count,
            returns.Sum(r => r.TotalReturnAmount),
            CountBy(ReturnStatus.Pending),
            CountBy(ReturnStatus.Approved),
            CountBy(ReturnStatus.Rejected),
            CountBy(ReturnStatus.Completed));
    }
}
