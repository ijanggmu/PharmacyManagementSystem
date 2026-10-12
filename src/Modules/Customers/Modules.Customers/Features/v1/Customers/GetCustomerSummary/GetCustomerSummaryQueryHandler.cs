using FSH.Framework.Core.Exceptions;
using FSH.Framework.Persistence;
using FSH.Modules.Customers.Contracts.Dtos;
using FSH.Modules.Customers.Contracts.v1.Customers;
using FSH.Modules.Customers.Data;
using FSH.Modules.Prescriptions.Contracts.v1.Prescriptions;
using FSH.Modules.Sales.Contracts.v1.Reports;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Customers.Features.v1.Customers.GetCustomerSummary;

/// <summary>
/// Composes the profile totals from the owning modules' contract queries: completed sales (cancelled ones
/// excluded) from Sales, the prescription count from Prescriptions. The client used to add these up itself
/// from the first 100 rows of the current branch's lists, which undercounted and included cancelled sales.
/// </summary>
public sealed class GetCustomerSummaryQueryHandler(CustomersDbContext dbContext, IMediator mediator, TimeProvider timeProvider)
    : IQueryHandler<GetCustomerSummaryQuery, CustomerSummaryDto>
{
    /// <summary>Lower bound for "all time" — before any sale this system can hold.</summary>
    private static readonly DateTime Epoch = new(2000, 1, 1, 0, 0, 0, DateTimeKind.Utc);

    public async ValueTask<CustomerSummaryDto> Handle(GetCustomerSummaryQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        // Trashed customers keep their history, so their summary still resolves (tenant filter stays on).
        bool exists = await dbContext.Customers.AsNoTracking()
            .IgnoreQueryFilters([QueryFilters.SoftDelete])
            .AnyAsync(c => c.Id == query.CustomerId, cancellationToken)
            .ConfigureAwait(false);
        if (!exists)
        {
            throw new NotFoundException($"Customer {query.CustomerId} not found.");
        }

        DateTime toUtc = timeProvider.GetUtcNow().UtcDateTime.AddDays(1);
        var sales = await mediator.Send(
            new GetCustomerSalesAggregateQuery(Epoch, toUtc, query.BranchId, query.CustomerId), cancellationToken)
            .ConfigureAwait(false);
        sales.TryGetValue(query.CustomerId, out var aggregate);

        var prescriptions = await mediator.Send(
            new SearchPrescriptionsQuery(CustomerId: query.CustomerId, PageNumber: 1, PageSize: 1), cancellationToken)
            .ConfigureAwait(false);

        return new CustomerSummaryDto(
            query.CustomerId,
            aggregate?.SaleCount ?? 0,
            aggregate?.TotalSpend ?? 0m,
            prescriptions.TotalCount);
    }
}
