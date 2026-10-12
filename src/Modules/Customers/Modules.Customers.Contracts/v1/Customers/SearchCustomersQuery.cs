using FSH.Framework.Shared.Persistence;
using FSH.Modules.Customers.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Customers.Contracts.v1.Customers;

/// <summary>
/// Paged customer search. <c>OrHasBalance</c> with <c>IsActive</c> = true also returns inactive customers who
/// still owe (or are owed) money — what a payment screen needs, since a deactivated customer can still settle up.
/// </summary>
public sealed record SearchCustomersQuery(
    string? Search = null,
    bool? IsActive = null,
    int PageNumber = 1,
    int PageSize = 50,
    string? SortBy = null,
    string? SortDir = null,
    bool OrHasBalance = false) : IQuery<PagedResponse<CustomerDto>>;
