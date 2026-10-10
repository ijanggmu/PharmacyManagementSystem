using Mediator;

namespace FSH.Modules.Customers.Contracts.v1.Customers;

public sealed record DeleteCustomerCommand(Guid CustomerId) : ICommand<Unit>;
