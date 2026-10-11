using Mediator;

namespace FSH.Modules.Customers.Contracts.v1.Customers;

public sealed record RestoreCustomerCommand(Guid CustomerId) : ICommand<Guid>;
