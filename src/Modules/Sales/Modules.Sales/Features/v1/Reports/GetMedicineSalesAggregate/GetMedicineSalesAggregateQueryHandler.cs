using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Sales.Contracts.Dtos;
using FSH.Modules.Sales.Contracts.v1.Reports;
using FSH.Modules.Sales.Data;
using FSH.Modules.Sales.Domain;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Sales.Features.v1.Reports.GetMedicineSalesAggregate;

/// <summary>Sums completed-sale line items by medicine over a date range, current-branch scoped.</summary>
public sealed class GetMedicineSalesAggregateQueryHandler(SalesDbContext dbContext, ICurrentBranch currentBranch)
    : IQueryHandler<GetMedicineSalesAggregateQuery, IReadOnlyDictionary<Guid, MedicineSalesAggregateDto>>
{
    public async ValueTask<IReadOnlyDictionary<Guid, MedicineSalesAggregateDto>> Handle(
        GetMedicineSalesAggregateQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        var scoped = dbContext.Sales.AsNoTracking()
            .Where(s => s.Status == SaleStatus.Completed
                && s.SaleDateUtc >= query.FromUtc
                && s.SaleDateUtc <= query.ToUtc);

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
            .SelectMany(s => s.Items)
            .GroupBy(i => i.MedicineId)
            .ToDictionary(
                g => g.Key,
                g => new MedicineSalesAggregateDto(g.Sum(i => i.Quantity), g.Sum(i => i.LineTotal)));
    }
}
