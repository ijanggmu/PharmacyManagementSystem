namespace FSH.Modules.Suppliers.Contracts.Dtos;

public sealed record SupplierDto(
    Guid Id,
    string Name,
    string? ContactPerson,
    string? Phone,
    string? Email,
    string? Address,
    string? TaxId,
    decimal CurrentBalance,
    bool IsActive,
    DateTime CreatedAtUtc,
    DateTime? UpdatedAtUtc,
    DateTimeOffset? DeletedOnUtc = null,
    string? DeletedBy = null,
    // Default payment terms in days (null = none).
    int? CreditDays = null);
