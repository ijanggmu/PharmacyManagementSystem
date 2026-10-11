using System.Net;
using FSH.Framework.Core.Domain;
using FSH.Framework.Core.Exceptions;

namespace FSH.Modules.Sales.Domain;

/// <summary>
/// Reached ONLY through <see cref="Sale"/>'s navigation collection — needs
/// <c>ValueGeneratedNever()</c> in its EF config (database.md nav-child footgun).
/// </summary>
public sealed class SaleItem : BaseEntity<Guid>
{
    public Guid SaleId { get; private set; }

    /// <summary>Mirrors the owning <see cref="Sale.BranchId"/> — required, assigned by
    /// <see cref="AssignSale"/> when the line is added (branch-scoping-plan.md §2).</summary>
    public Guid BranchId { get; private set; }

    public Guid MedicineId { get; private set; }
    public decimal Quantity { get; private set; }

    /// <summary>Server-resolved unit price (catalog or FEFO batch selling price). Never client input.</summary>
    public decimal UnitPrice { get; private set; }

    /// <summary>Total line discount in currency: the absolute discount plus the percent discount
    /// (<see cref="DiscountPercent"/> of the gross line), rounded to 2 dp.</summary>
    public decimal DiscountAmount { get; private set; }

    /// <summary>Legacy per-line percent discount (0-100), as applied by create_sale_with_items.</summary>
    public decimal DiscountPercent { get; private set; }

    /// <summary>Weighted-average actual cost from the FEFO batches consumed — what Sales' COGS
    /// voucher line is posted at, not a list/standard cost.</summary>
    public decimal UnitCostPrice { get; private set; }

    /// <summary>Snapshot of the medicine's VAT status at sale time (Medicine.IsTaxable). False = VAT-exempt
    /// line: no VAT is carved out of it and it is reported under exempt sales on the invoice.</summary>
    public bool IsTaxable { get; private set; } = true;

    public decimal LineTotal => (Quantity * UnitPrice) - DiscountAmount;

    /// <summary>What one unit actually cost the customer after every line discount (manual, member and
    /// loyalty), rounded to the paisa — the price a return or refund of this line is valued at.</summary>
    public decimal EffectiveUnitPrice => Quantity == 0m ? 0m : Money.Round(LineTotal / Quantity);

    /// <summary>
    /// The money value of giving back <paramref name="quantity"/> units of this line, given what earlier
    /// returns/refunds of the line already took (<paramref name="alreadyQuantity"/> units worth
    /// <paramref name="alreadyAmount"/>). Each portion is the line's net total pro rata, rounded to the
    /// paisa; the portion that brings the line back to zero takes exactly what is left, so the pieces
    /// always add up to <see cref="LineTotal"/> and a fully reversed line never over- or under-refunds.
    /// </summary>
    public decimal ReversalAmount(decimal quantity, decimal alreadyQuantity, decimal alreadyAmount)
    {
        if (quantity <= 0m || Quantity == 0m)
        {
            return 0m;
        }

        decimal lineTotal = Money.Round(LineTotal);
        if (alreadyQuantity + quantity >= Quantity)
        {
            return Math.Max(0m, lineTotal - alreadyAmount);
        }

        return Money.Round(lineTotal * quantity / Quantity);
    }

    private SaleItem() { }

    internal static SaleItem Create(
        Guid medicineId, decimal quantity, decimal unitPrice, decimal discountAmount, decimal discountPercent, decimal unitCostPrice,
        bool isTaxable = true)
    {
        if (quantity <= 0)
        {
            throw new CustomException("Line quantity must be positive.", (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
        }

        if (unitPrice < 0)
        {
            throw new CustomException("Unit price cannot be negative.", (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
        }

        if (discountPercent < 0 || discountPercent > 100)
        {
            throw new CustomException("Discount percent must be between 0 and 100.", (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
        }

        if (discountAmount < 0)
        {
            throw new CustomException("Discount cannot be negative.", (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
        }

        decimal gross = quantity * unitPrice;
        decimal percentAmount = Math.Round(gross * discountPercent / 100m, 2, MidpointRounding.AwayFromZero);
        decimal totalDiscount = discountAmount + percentAmount;

        if (totalDiscount > gross)
        {
            throw new CustomException(
                "Discount cannot exceed the line's gross amount.", (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
        }

        return new SaleItem
        {
            Id = Guid.CreateVersion7(),
            MedicineId = medicineId,
            Quantity = quantity,
            UnitPrice = unitPrice,
            DiscountAmount = totalDiscount,
            DiscountPercent = discountPercent,
            UnitCostPrice = unitCostPrice,
            IsTaxable = isTaxable,
        };
    }

    internal void AssignSale(Guid saleId, Guid branchId)
    {
        SaleId = saleId;
        BranchId = branchId;
    }
}
