using Mediator;

namespace FSH.Modules.Customers.Contracts.v1.Customers;

public sealed record CreateCustomerCommand(
    string Name,
    string? Phone = null,
    string? Email = null,
    string? Address = null,
    decimal OpeningBalance = 0m,
    IReadOnlyList<string>? Allergies = null) : ICommand<Guid>;
