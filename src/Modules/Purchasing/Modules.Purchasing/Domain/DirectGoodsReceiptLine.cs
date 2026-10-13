using FSH.Framework.Core.Domain;

namespace FSH.Modules.Purchasing.Domain;

/// <summary>
/// One line of a <see cref="DirectGoodsReceipt"/>. Reached ONLY through the parent's navigation
/// collection — needs <c>ValueGeneratedNever()</c> in its EF config (database.md nav-child footgun),
/// same as <see cref="PurchaseOrderLine"/>. Quantities are in base units; see <see cref="PurchaseLineMath"/>
/// for how gross, discounts, the taxable net and the effective unit cost relate.
/// </summary>
public sealed class DirectGoodsReceiptLine : BaseEntity<Guid>
{
    public Guid DirectGoodsReceiptId { get; private set; }
    public Guid MedicineId { get; private set; }

    /// <summary>Paid (billed) quantity, in base units.</summary>
    public decimal Quantity { get; private set; }

    /// <summary>Rate per base unit, before discounts (rounded to 2 dp when the line was entered in packs).</summary>
    public decimal UnitCostPrice { get; private set; }

    /// <summary>Input VAT on this line's discounted taxable value (<see cref="NetAmount"/>).</summary>
    public decimal VatAmount { get; private set; }

    /// <summary>Bonus units received at no charge (the "1" of a 10+1 scheme), in base units.</summary>
    public decimal FreeQuantity { get; private set; }

    /// <summary>Trade discount percent as entered (informational when an amount was entered instead).</summary>
    public decimal DiscountPercent { get; private set; }

    /// <summary>The line's trade discount amount.</summary>
    public decimal DiscountAmount { get; private set; }

    /// <summary>This line's share of the bill-level (cash/trade) discount.</summary>
    public decimal BillDiscountAmount { get; private set; }

    /// <summary>Units per pack when the line was entered in packs; null when entered in base units.</summary>
    public decimal? PackSize { get; private set; }

    /// <summary>Rate per pack when the line was entered in packs.</summary>
    public decimal? PackUnitCost { get; private set; }

    /// <summary>Inherited from the parent <see cref="DirectGoodsReceipt"/> at line-creation time —
    /// mirrors <c>goods_receipt_items.branch_id</c>, which script 42 backfills from its parent
    /// <c>goods_receipts</c> row rather than resolving independently.</summary>
    public Guid BranchId { get; private set; }

    /// <summary>The Inventory lot this line's stock went into, recorded when the stock was received, so a
    /// void takes it back out of that exact lot. Null on lines received before lots were recorded and on
    /// receipts recorded from a medicine create/edit or bulk import (Inventory added that stock itself).</summary>
    public Guid? BatchId { get; private set; }

    /// <summary>The lot's batch number, as stored by Inventory (normalized). Null alongside <see cref="BatchId"/>.</summary>
    public string? BatchNo { get; private set; }

    /// <summary>Quantity × rate, before any discount.</summary>
    public decimal GrossAmount => PurchaseLineMath.Gross(Quantity, UnitCostPrice, PackSize, PackUnitCost);

    /// <summary>Gross less the line's own trade discount (the base the bill discount is spread on).</summary>
    public decimal DiscountedAmount => GrossAmount - DiscountAmount;

    /// <summary>Taxable value: gross less the line and bill discounts. Input VAT is charged on this.</summary>
    public decimal NetAmount => GrossAmount - DiscountAmount - BillDiscountAmount;

    /// <summary>Every unit that went into stock: paid plus free.</summary>
    public decimal ReceivedQuantity => Quantity + FreeQuantity;

    /// <summary>Cost of each unit put into stock (free ones included): net / (quantity + free quantity).</summary>
    public decimal EffectiveUnitCost => PurchaseLineMath.EffectiveUnitCost(NetAmount, Quantity, FreeQuantity);

    private DirectGoodsReceiptLine() { }

    internal static DirectGoodsReceiptLine Create(
        Guid medicineId, decimal quantity, decimal unitCostPrice, decimal vatAmount, PurchaseLineTerms terms, decimal discountAmount)
    {
        return new DirectGoodsReceiptLine
        {
            Id = Guid.CreateVersion7(),
            MedicineId = medicineId,
            Quantity = quantity,
            UnitCostPrice = unitCostPrice,
            VatAmount = vatAmount,
            FreeQuantity = terms.FreeQuantity,
            DiscountPercent = terms.DiscountPercent,
            DiscountAmount = discountAmount,
            PackSize = terms.PackSize,
            PackUnitCost = terms.PackSize is null ? null : terms.PackUnitCost,
        };
    }

    internal void AssignBillDiscount(decimal amount) => BillDiscountAmount = amount;

    internal void RecordLot(Guid batchId, string batchNo)
    {
        BatchId = batchId;
        BatchNo = string.IsNullOrWhiteSpace(batchNo) ? null : batchNo.Trim();
    }

    internal void AssignReceipt(Guid directGoodsReceiptId, Guid branchId)
    {
        DirectGoodsReceiptId = directGoodsReceiptId;
        BranchId = branchId;
    }
}
