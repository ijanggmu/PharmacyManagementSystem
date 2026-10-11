using FSH.Modules.Customers.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Customers.Contracts.v1.Reports;

/// <summary>New-customer counts bucketed by calendar month over [FromUtc, ToUtc], based on Customer.CreatedAtUtc.</summary>
public sealed record GetCustomerGrowthQuery(DateTime FromUtc, DateTime ToUtc)
    : IQuery<IReadOnlyList<CustomerGrowthPointDto>>;
