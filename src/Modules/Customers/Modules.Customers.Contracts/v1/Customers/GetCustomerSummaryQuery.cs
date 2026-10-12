using FSH.Modules.Customers.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Customers.Contracts.v1.Customers;

/// <summary>
/// Totals for one customer's profile. <c>BranchId</c> null = every branch the caller may view (all of them
/// for a caller who can view all branches; otherwise their own branch).
/// </summary>
public sealed record GetCustomerSummaryQuery(Guid CustomerId, Guid? BranchId = null) : IQuery<CustomerSummaryDto>;
