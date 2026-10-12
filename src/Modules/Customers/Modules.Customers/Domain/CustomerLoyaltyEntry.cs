using FSH.Framework.Core.Domain;

namespace FSH.Modules.Customers.Domain;

public enum LoyaltyEntryType
{
    /// <summary>Earned on a completed sale.</summary>
    Earn,

    /// <summary>Spent as a discount on a sale.</summary>
    Redeem,

    /// <summary>Staff correction.</summary>
    Adjust,

    /// <summary>Points earned on a sale taken back because the sale was cancelled, returned or refunded.</summary>
    EarnReversed,

    /// <summary>Points spent on a sale given back because the sale was cancelled, returned or refunded.</summary>
    RedeemRestored,
}

/// <summary>Append-only trail of a customer's loyalty points; <see cref="BalanceAfter"/> is the running total.</summary>
public sealed class CustomerLoyaltyEntry : AggregateRoot<Guid>
{
    public Guid CustomerId { get; private set; }
    public LoyaltyEntryType EntryType { get; private set; }
    public int Points { get; private set; }
    public int BalanceAfter { get; private set; }
    public string? Description { get; private set; }
    public Guid? SaleId { get; private set; }
    public Guid? BranchId { get; private set; }
    public DateTime CreatedAtUtc { get; private set; }

    /// <summary>
    /// On an <see cref="LoyaltyEntryType.EarnReversed"/> entry written for a cancellation/return/refund: the
    /// cumulative share (0..1) of the sale reversed at that point. Lets a <c>SaleCompleted</c> event that is
    /// handled AFTER the reversal (outbox retry / out-of-order delivery) earn only on what is left of the sale.
    /// A reversal that arrives before anything was earned is recorded as a 0-point entry carrying just this
    /// share. Null on every other entry and on rows written before it existed.
    /// </summary>
    public decimal? ReversedShare { get; private set; }

    private CustomerLoyaltyEntry() { }

    public static CustomerLoyaltyEntry Create(
        Guid customerId, LoyaltyEntryType entryType, int points, int balanceAfter, string? description,
        Guid? saleId = null, Guid? branchId = null, Guid? id = null, decimal? reversedShare = null) => new()
    {
        // A caller that must apply an entry at most once passes a deterministic id derived from what caused
        // it; the primary key then rejects a second copy.
        Id = id ?? Guid.CreateVersion7(),
        CustomerId = customerId,
        EntryType = entryType,
        Points = points,
        BalanceAfter = balanceAfter,
        Description = description?.Trim(),
        SaleId = saleId,
        BranchId = branchId,
        CreatedAtUtc = DateTime.UtcNow,
        ReversedShare = reversedShare is { } share ? Math.Clamp(share, 0m, 1m) : null,
    };
}
