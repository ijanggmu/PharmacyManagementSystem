using FSH.Modules.Customers.Contracts.Dtos;
using FSH.Modules.Customers.Contracts.v1.Reports;
using FSH.Modules.Customers.Data;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Customers.Features.v1.Reports.GetCustomerGrowth;

public sealed class GetCustomerGrowthQueryHandler(CustomersDbContext dbContext)
    : IQueryHandler<GetCustomerGrowthQuery, IReadOnlyList<CustomerGrowthPointDto>>
{
    public async ValueTask<IReadOnlyList<CustomerGrowthPointDto>> Handle(
        GetCustomerGrowthQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        var createdDates = await dbContext.Customers.AsNoTracking()
            .Where(c => c.CreatedAtUtc >= query.FromUtc && c.CreatedAtUtc <= query.ToUtc)
            .Select(c => c.CreatedAtUtc)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        return createdDates
            .GroupBy(d => new DateTime(d.Year, d.Month, 1, 0, 0, 0, DateTimeKind.Utc))
            .Select(g => new CustomerGrowthPointDto(g.Key, g.Count()))
            .OrderBy(p => p.MonthStartUtc)
            .ToList();
    }
}
