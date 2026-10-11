using FSH.Modules.Customers.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Customers.Contracts.v1.Reports;

/// <summary>Top customers by total spend over [FromUtc, ToUtc], computed over the whole period server-side.</summary>
public sealed record GetTopCustomersQuery(DateTime FromUtc, DateTime ToUtc, int Take = 10)
    : IQuery<IReadOnlyList<TopCustomerDto>>;
