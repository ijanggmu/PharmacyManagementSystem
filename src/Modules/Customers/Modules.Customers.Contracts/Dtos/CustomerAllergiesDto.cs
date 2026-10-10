namespace FSH.Modules.Customers.Contracts.Dtos;

/// <summary>
/// The customer's recorded allergies, as free-text substance names. Used by Sales to run the
/// legacy-equivalent allergy check at checkout without referencing the Customers runtime.
/// </summary>
public sealed record CustomerAllergiesDto(Guid CustomerId, IReadOnlyList<string> Allergies);
