using Mediator;

namespace FSH.Modules.Suppliers.Contracts.v1.Suppliers;

public sealed record UpdateSupplierCommand(
    Guid SupplierId,
    string Name,
    string? ContactPerson = null,
    string? Phone = null,
    string? Email = null,
    string? Address = null,
    string? TaxId = null,
    bool IsActive = true) : ICommand<Guid>;
