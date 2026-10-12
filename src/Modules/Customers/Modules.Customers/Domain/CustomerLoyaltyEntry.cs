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

    /// <summary>Points earned on a sale taken back: the sale was cancelled, or part of it refunded.</summary>
    EarnReversed,

    /// <summary>Points spent on a sale given back because the sale was cancelled.</summary>
    RedeemReturned,
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

    /// <summary>The refund an <see cref="LoyaltyEntryType.EarnReversed"/> entry came from; null otherwise.</summary>
    public Guid? RefundId { get; private set; }

    public Guid? BranchId { get; private set; }
    public DateTime CreatedAtUtc { get; private set; }

    private CustomerLoyaltyEntry() { }

    public static CustomerLoyaltyEntry Create(
        Guid customerId, LoyaltyEntryType entryType, int points, int balanceAfter, string? description,
        Guid? saleId = null, Guid? branchId = null, Guid? refundId = null) => new()
    {
        Id = Guid.CreateVersion7(),
        CustomerId = customerId,
        EntryType = entryType,
        Points = points,
        BalanceAfter = balanceAfter,
        Description = description?.Trim(),
        SaleId = saleId,
        RefundId = refundId,
        BranchId = branchId,
        CreatedAtUtc = DateTime.UtcNow,
    };
}
