namespace FSH.Modules.Customers.Contracts.Dtos;

public sealed record CustomerDto(
    Guid Id,
    string Name,
    string? Phone,
    string? Email,
    string? Address,
    decimal CurrentBalance,
    bool IsActive,
    DateTime CreatedAtUtc,
    DateTime? UpdatedAtUtc,
    DateTimeOffset? DeletedOnUtc = null,
    string? DeletedBy = null);
