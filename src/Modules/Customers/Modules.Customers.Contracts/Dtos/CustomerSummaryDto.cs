namespace FSH.Modules.Customers.Contracts.Dtos;

/// <summary>Server-side totals for a customer's profile: completed (not cancelled) sales and their value
/// across the branches the caller may see, and the number of prescriptions on file.</summary>
public sealed record CustomerSummaryDto(
    Guid CustomerId,
    int PurchaseCount,
    decimal? TotalSpent,
    long PrescriptionCount);
