using FSH.Framework.Shared.Persistence;
using FSH.Modules.Customers.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Customers.Contracts.v1.Customers;

public sealed record ListTrashedCustomersQuery(int PageNumber = 1, int PageSize = 20)
    : IQuery<PagedResponse<CustomerDto>>;
