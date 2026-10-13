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
    bool IsActive = true,
    // Default payment terms for bills booked from now on (existing bills keep their due dates). Null = no terms.
    int? CreditDays = null) : ICommand<Guid>;
