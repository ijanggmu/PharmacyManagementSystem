using FSH.Modules.Inventory.Contracts.Dtos;
using FSH.Modules.Inventory.Contracts.v1.Reports;
using FSH.Modules.Inventory.Data;
using FSH.Modules.Sales.Contracts.v1.Reports;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Inventory.Features.v1.Reports.GetCategoryPerformance;

/// <summary>Composes Sales' per-medicine aggregate with each medicine's CategoryId, grouped by category.
/// Category *names* are resolved client-side from the Reference module's categories list; this DTO only
/// carries CategoryId so Inventory does not need a new cross-module dependency on Reference.</summary>
public sealed class GetCategoryPerformanceQueryHandler(InventoryDbContext dbContext, IMediator mediator)
    : IQueryHandler<GetCategoryPerformanceQuery, IReadOnlyList<CategoryPerformanceDto>>
{
    public async ValueTask<IReadOnlyList<CategoryPerformanceDto>> Handle(
        GetCategoryPerformanceQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        var aggregate = await mediator.Send(
            new GetMedicineSalesAggregateQuery(query.FromUtc, query.ToUtc, query.BranchId), cancellationToken).ConfigureAwait(false);
        if (aggregate.Count == 0)
        {
            return [];
        }

        var ids = aggregate.Keys.ToList();
        var medicines = await dbContext.Medicines.AsNoTracking()
            .Where(m => ids.Contains(m.Id))
            .Select(m => new { m.Id, m.CategoryId })
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        return medicines
            .GroupBy(m => m.CategoryId)
            .Select(g =>
            {
                decimal quantity = 0m;
                decimal revenue = 0m;
                foreach (var m in g)
                {
                    if (aggregate.TryGetValue(m.Id, out var agg))
                    {
                        quantity += agg.Quantity;
                        revenue += agg.Revenue;
                    }
                }

                return new CategoryPerformanceDto(g.Key, quantity, revenue, g.Count());
            })
            .OrderByDescending(d => d.Revenue)
            .ToList();
    }
}
