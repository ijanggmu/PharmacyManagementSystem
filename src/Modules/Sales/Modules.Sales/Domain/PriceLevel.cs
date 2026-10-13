using System.Net;
using FSH.Framework.Core.Domain;
using FSH.Framework.Core.Exceptions;

namespace FSH.Modules.Sales.Domain;

/// <summary>
/// A price level customers can be put on (wholesale, a hospital contract, ...). Retail has no row: it is the lot's
/// selling price. A level prices each lot at <see cref="DiscountPercent"/> below the lot price, or at a medicine's
/// explicit price on the level (<see cref="PriceLevelItem"/>) — never above the lot price, which is the MRP.
/// </summary>
public sealed class PriceLevel : BaseEntity<Guid>
{
    public const int MaxNameLength = 100;
    public const int MaxDescriptionLength = 500;

    public string Name { get; private set; } = default!;

    /// <summary>Percent below the lot price (0-100, 2 dp) for medicines with no explicit price on this level.</summary>
    public decimal DiscountPercent { get; private set; }

    public string? Description { get; private set; }

    /// <summary>An inactive level is no longer applied: its customers buy at retail until it is re-activated.</summary>
    public bool IsActive { get; private set; } = true;

    public DateTime CreatedAtUtc { get; private set; }
    public DateTime? UpdatedAtUtc { get; private set; }

    private PriceLevel() { }

    public static PriceLevel Create(string name, decimal discountPercent, string? description)
    {
        var level = new PriceLevel { Id = Guid.CreateVersion7(), CreatedAtUtc = DateTime.UtcNow };
        level.Apply(name, discountPercent, description, isActive: true);
        level.UpdatedAtUtc = null;
        return level;
    }

    public void Update(string name, decimal discountPercent, string? description, bool isActive) =>
        Apply(name, discountPercent, description, isActive);

    private void Apply(string name, decimal discountPercent, string? description, bool isActive)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(name);
        if (discountPercent < 0m || discountPercent > 100m)
        {
            throw new CustomException("A price level's discount is 0-100%.", (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
        }

        Name = name.Trim();
        DiscountPercent = discountPercent;
        Description = string.IsNullOrWhiteSpace(description) ? null : description.Trim();
        IsActive = isActive;
        UpdatedAtUtc = DateTime.UtcNow;
    }
}

/// <summary>A medicine's explicit price per base unit on a level (VAT-inclusive, like every selling price).</summary>
public sealed class PriceLevelItem : BaseEntity<Guid>
{
    public Guid PriceLevelId { get; private set; }
    public Guid MedicineId { get; private set; }
    public decimal UnitPrice { get; private set; }
    public DateTime UpdatedAtUtc { get; private set; }

    private PriceLevelItem() { }

    public static PriceLevelItem Create(Guid priceLevelId, Guid medicineId, decimal unitPrice)
    {
        var item = new PriceLevelItem { Id = Guid.CreateVersion7(), PriceLevelId = priceLevelId, MedicineId = medicineId };
        item.SetPrice(unitPrice);
        return item;
    }

    public void SetPrice(decimal unitPrice)
    {
        if (unitPrice <= 0m)
        {
            throw new CustomException("A level price must be positive.", (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
        }

        UnitPrice = Money.Round(unitPrice);
        UpdatedAtUtc = DateTime.UtcNow;
    }
}

/// <summary>Which price level a customer buys at (no row = retail). Kept in Sales, which owns pricing.</summary>
public sealed class CustomerPriceLevel : BaseEntity<Guid>
{
    public Guid CustomerId { get; private set; }
    public Guid PriceLevelId { get; private set; }
    public DateTime AssignedAtUtc { get; private set; }

    private CustomerPriceLevel() { }

    public static CustomerPriceLevel Create(Guid customerId, Guid priceLevelId) => new()
    {
        Id = Guid.CreateVersion7(),
        CustomerId = customerId,
        PriceLevelId = priceLevelId,
        AssignedAtUtc = DateTime.UtcNow,
    };

    public void Reassign(Guid priceLevelId)
    {
        PriceLevelId = priceLevelId;
        AssignedAtUtc = DateTime.UtcNow;
    }
}

/// <summary>
/// The pricing rules of one level, resolved for the medicines of a cart: what a base unit from a lot priced
/// <c>lotPrice</c> sells for. Pure, so the server (CreateSale) and the tests share it; the web app mirrors it in
/// features/sales/lib/price-levels.ts.
/// </summary>
public sealed record PriceLevelPricing(
    Guid Id, string Name, decimal DiscountPercent, IReadOnlyDictionary<Guid, decimal> ExplicitPrices)
{
    /// <summary>The level's price for one base unit from a lot priced <paramref name="lotPrice"/> (rounded to the
    /// paisa, half away from zero). An explicit price above the lot price is capped at it: the lot price is the MRP.</summary>
    public decimal PriceFor(Guid medicineId, decimal lotPrice)
    {
        if (lotPrice <= 0m)
        {
            return lotPrice;
        }

        decimal price = ExplicitPrices.TryGetValue(medicineId, out var explicitPrice)
            ? explicitPrice
            : Money.Round(lotPrice * (100m - DiscountPercent) / 100m);
        return Math.Min(price, lotPrice);
    }
}
