namespace FSH.Modules.Customers.Contracts.Dtos;

/// <summary>One movement on a customer's points (earned on a sale, redeemed, or adjusted by staff).</summary>
public sealed record LoyaltyEntryDto(
    Guid Id,
    DateTime CreatedAtUtc,
    string EntryType,
    int Points,
    int BalanceAfter,
    string? Description,
    Guid? SaleId);

/// <summary>A customer's loyalty account: membership, points, what they're worth now, recent movements.</summary>
public sealed record CustomerLoyaltyDto(
    Guid CustomerId,
    bool IsMember,
    DateTime? MemberSinceUtc,
    int Points,
    decimal PointsValue,
    IReadOnlyList<LoyaltyEntryDto> Entries);

/// <summary>What a sale needs to validate a redemption (in-process, read by Sales).</summary>
public sealed record CustomerLoyaltyStatusDto(Guid CustomerId, bool IsMember, int Points);
