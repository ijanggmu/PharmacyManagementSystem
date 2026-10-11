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
    string? DeletedBy = null,
    // Customer number on the card / in its QR (e.g. C-000123).
    string? Code = null,
    // Null = no limit.
    decimal? CreditLimit = null,
    // CreditLimit - CurrentBalance; null when there is no limit.
    decimal? AvailableCredit = null,
    // Loyalty programme member (earns points, gets the member discount).
    bool IsMember = false,
    int LoyaltyPoints = 0);

/// <summary>What a credit sale needs to know about the customer's account (in-process, read by Sales).</summary>
public sealed record CustomerCreditStatusDto(
    Guid CustomerId,
    string Name,
    decimal CurrentBalance,
    decimal? CreditLimit);
