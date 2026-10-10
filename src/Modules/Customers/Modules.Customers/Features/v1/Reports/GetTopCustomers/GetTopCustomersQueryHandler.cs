using FSH.Modules.Customers.Contracts.Dtos;
using FSH.Modules.Customers.Contracts.v1.Reports;
using FSH.Modules.Customers.Data;
using FSH.Modules.Sales.Contracts.v1.Reports;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Customers.Features.v1.Reports.GetTopCustomers;

/// <summary>Composes Sales' per-customer aggregate (via Mediator, same pattern as Purchasing's reorder
/// suggestions) with Customers' own names, ranked by total spend.</summary>
public sealed class GetTopCustomersQueryHandler(CustomersDbContext dbContext, IMediator mediator)
    : IQueryHandler<GetTopCustomersQuery, IReadOnlyList<TopCustomerDto>>
{
    public async ValueTask<IReadOnlyList<TopCustomerDto>> Handle(
        GetTopCustomersQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        var aggregate = await mediator.Send(
            new GetCustomerSalesAggregateQuery(query.FromUtc, query.ToUtc), cancellationToken).ConfigureAwait(false);
        if (aggregate.Count == 0)
        {
            return [];
        }

        var ids = aggregate.Keys.ToList();
        var names = await dbContext.Customers.AsNoTracking()
            .Where(c => ids.Contains(c.Id))
            .Select(c => new { c.Id, c.Name })
            .ToDictionaryAsync(c => c.Id, c => c.Name, cancellationToken)
            .ConfigureAwait(false);

        int take = Math.Clamp(query.Take, 1, 100);

        return aggregate
            .Where(kvp => names.ContainsKey(kvp.Key))
            .Select(kvp => new TopCustomerDto(kvp.Key, names[kvp.Key], kvp.Value.SaleCount, kvp.Value.TotalSpend))
            .OrderByDescending(d => d.TotalSpend)
            .Take(take)
            .ToList();
    }
}
