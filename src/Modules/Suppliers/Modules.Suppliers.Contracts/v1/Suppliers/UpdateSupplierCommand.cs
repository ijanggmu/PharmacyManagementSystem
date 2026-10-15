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
    // Null keeps the supplier's current status, so an edit that doesn't send it never reactivates an inactive supplier.
    bool? IsActive = null,
    // Default payment terms for bills booked from now on (existing bills keep their due dates). Null = no terms.
    int? CreditDays = null) : ICommand<Guid>;
