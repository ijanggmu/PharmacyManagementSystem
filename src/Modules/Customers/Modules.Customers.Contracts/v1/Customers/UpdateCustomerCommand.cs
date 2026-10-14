using Mediator;

namespace FSH.Modules.Customers.Contracts.v1.Customers;

/// <summary>
/// Updates a customer. <see cref="Name"/>, <see cref="Phone"/>, <see cref="Email"/> and <see cref="Address"/>
/// are a full replace: send the stored value to keep it, null (or blank) clears it. Every other field is
/// optional and null keeps what is stored — <see cref="IsActive"/> included, so an update that leaves it out
/// never reactivates (or deactivates) a customer.
/// </summary>
public sealed record UpdateCustomerCommand(
    Guid CustomerId,
    string Name,
    string? Phone = null,
    string? Email = null,
    string? Address = null,
    // Null keeps the stored active flag.
    bool? IsActive = null,
    IReadOnlyList<string>? Allergies = null,
    // Null keeps the stored limit; ClearCreditLimit removes it (no limit).
    decimal? CreditLimit = null,
    bool ClearCreditLimit = false,
    // Null keeps the stored membership.
    bool? IsMember = null,
    // Null keeps the stored list; an empty list clears it (same as Allergies).
    IReadOnlyList<string>? ChronicConditions = null,
    IReadOnlyList<string>? CurrentMedications = null,
    // Payment terms in days. Null keeps the stored terms; ClearCreditDays removes them (no terms).
    int? CreditDays = null,
    bool ClearCreditDays = false,
    // Null keeps the stored SMS consent.
    bool? SmsConsent = null,
    // PAN / VAT number (9 digits). Null keeps the stored one; blank clears it.
    string? PanNumber = null,
    // Date of birth. Null keeps the stored date; ClearDateOfBirth removes it.
    DateOnly? DateOfBirth = null,
    bool ClearDateOfBirth = false,
    // Insurer and policy number. Null keeps the stored value; blank clears it.
    string? InsuranceProvider = null,
    string? InsuranceNumber = null) : ICommand<Guid>;
