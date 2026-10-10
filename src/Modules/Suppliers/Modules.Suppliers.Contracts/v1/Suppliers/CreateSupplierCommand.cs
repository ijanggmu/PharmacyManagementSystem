using Mediator;

namespace FSH.Modules.Suppliers.Contracts.v1.Suppliers;

public sealed record CreateSupplierCommand(
    string Name,
    string? ContactPerson = null,
    string? Phone = null,
    string? Email = null,
    string? Address = null,
    string? TaxId = null,
    decimal OpeningBalance = 0m) : ICommand<Guid>;
