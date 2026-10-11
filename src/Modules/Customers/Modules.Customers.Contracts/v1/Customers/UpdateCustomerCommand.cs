using Mediator;

namespace FSH.Modules.Customers.Contracts.v1.Customers;

public sealed record UpdateCustomerCommand(
    Guid CustomerId,
    string Name,
    string? Phone = null,
    string? Email = null,
    string? Address = null,
    bool IsActive = true,
    IReadOnlyList<string>? Allergies = null,
    // Null keeps the stored limit; ClearCreditLimit removes it (no limit).
    decimal? CreditLimit = null,
    bool ClearCreditLimit = false,
    // Null keeps the stored membership.
    bool? IsMember = null,
    // Null keeps the stored list; an empty list clears it (same as Allergies).
    IReadOnlyList<string>? ChronicConditions = null,
    IReadOnlyList<string>? CurrentMedications = null) : ICommand<Guid>;
