using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Sales.Contracts.Dtos;
using FSH.Modules.Sales.Contracts.v1.Sales;
using FSH.Modules.Sales.Data;
using FSH.Modules.Sales.Domain;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Sales.Features.v1.Sales.GetSalesStats;

public sealed class GetSalesStatsQueryHandler(SalesDbContext dbContext, ICurrentBranch currentBranch)
    : IQueryHandler<GetSalesStatsQuery, SalesStatsDto>
{
    public async ValueTask<SalesStatsDto> Handle(GetSalesStatsQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        Guid? branchId = await currentBranch.ResolveListBranchFilterAsync(query.BranchId, cancellationToken).ConfigureAwait(false);

        var completedSales = await dbContext.Sales
            .AsNoTracking()
            .Include(s => s.Items)
            .Where(s => s.Status == SaleStatus.Completed && s.SaleDateUtc >= query.DateFromUtc && s.SaleDateUtc <= query.DateToUtc)
            .Where(s => branchId == null || s.BranchId == branchId)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        int count = completedSales.Count;
        decimal totalRevenue = completedSales.Sum(s => s.TotalAmount);
        decimal totalDiscount = completedSales.Sum(s => s.Items.Sum(i => i.DiscountAmount));

        return new SalesStatsDto(
            count, totalRevenue, totalDiscount,
            count == 0 ? 0m : totalRevenue / count);
    }
}
