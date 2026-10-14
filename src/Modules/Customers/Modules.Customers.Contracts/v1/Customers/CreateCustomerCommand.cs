using Mediator;

namespace FSH.Modules.Customers.Contracts.v1.Customers;

public sealed record CreateCustomerCommand(
    string Name,
    string? Phone = null,
    string? Email = null,
    string? Address = null,
    decimal OpeningBalance = 0m,
    IReadOnlyList<string>? Allergies = null,
    // Most the customer may owe on account; null = no limit.
    decimal? CreditLimit = null,
    // Joins the loyalty programme.
    bool IsMember = false,
    // Free-text medical notes shown at the counter; null = none.
    IReadOnlyList<string>? ChronicConditions = null,
    IReadOnlyList<string>? CurrentMedications = null,
    // Payment terms: sales on account fall due this many days later; null = no terms.
    int? CreditDays = null,
    // Agreed to automated SMS (refill / automatic dues reminders).
    bool SmsConsent = false,
    // PAN / VAT registration number (9 digits); null = none.
    string? PanNumber = null,
    // Date of birth; null = unknown.
    DateOnly? DateOfBirth = null,
    // Health insurer and policy / member number; null = none.
    string? InsuranceProvider = null,
    string? InsuranceNumber = null) : ICommand<Guid>;
