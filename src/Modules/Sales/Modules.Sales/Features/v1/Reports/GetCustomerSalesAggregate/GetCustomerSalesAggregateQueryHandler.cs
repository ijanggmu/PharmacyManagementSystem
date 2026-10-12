using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Sales.Contracts.Dtos;
using FSH.Modules.Sales.Contracts.v1.Reports;
using FSH.Modules.Sales.Data;
using FSH.Modules.Sales.Domain;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Sales.Features.v1.Reports.GetCustomerSalesAggregate;

/// <summary>Sums completed sales by customer over a date range, current-branch scoped. Sales with no
/// customer (walk-ins) are excluded.</summary>
public sealed class GetCustomerSalesAggregateQueryHandler(SalesDbContext dbContext, ICurrentBranch currentBranch)
    : IQueryHandler<GetCustomerSalesAggregateQuery, IReadOnlyDictionary<Guid, CustomerSalesAggregateDto>>
{
    public async ValueTask<IReadOnlyDictionary<Guid, CustomerSalesAggregateDto>> Handle(
        GetCustomerSalesAggregateQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        var scoped = dbContext.Sales.AsNoTracking()
            .Where(s => s.Status == SaleStatus.Completed
                && s.CustomerId != null
                && s.SaleDateUtc >= query.FromUtc
                && s.SaleDateUtc <= query.ToUtc);

        if (query.CustomerId is { } customerId)
        {
            scoped = scoped.Where(s => s.CustomerId == customerId);
        }

        var branchId = await currentBranch.ResolveListBranchFilterAsync(query.BranchId, cancellationToken).ConfigureAwait(false);
        if (branchId is { } scopedBranchId)
        {
            scoped = scoped.Where(s => s.BranchId == scopedBranchId);
        }

        var sales = await scoped
            .Include(s => s.Items)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        return sales
            .GroupBy(s => s.CustomerId!.Value)
            .ToDictionary(
                g => g.Key,
                g => new CustomerSalesAggregateDto(g.Count(), g.Sum(s => s.TotalAmount)));
    }
}
