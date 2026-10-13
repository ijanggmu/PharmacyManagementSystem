using Mediator;

namespace FSH.Modules.Suppliers.Contracts.v1.Suppliers;

public sealed record CreateSupplierCommand(
    string Name,
    string? ContactPerson = null,
    string? Phone = null,
    string? Email = null,
    string? Address = null,
    string? TaxId = null,
    decimal OpeningBalance = 0m,
    // Default payment terms: bills fall due this many days after the bill date. Null = no terms.
    int? CreditDays = null) : ICommand<Guid>;
