using FSH.Modules.Customers.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Customers.Contracts.v1.Customers;

public sealed record GetCustomerByIdQuery(Guid CustomerId) : IQuery<CustomerDto>;
