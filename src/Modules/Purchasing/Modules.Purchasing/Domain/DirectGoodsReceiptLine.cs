using FSH.Framework.Core.Domain;

namespace FSH.Modules.Purchasing.Domain;

/// <summary>
/// One line of a <see cref="DirectGoodsReceipt"/>. Reached ONLY through the parent's navigation
/// collection — needs <c>ValueGeneratedNever()</c> in its EF config (database.md nav-child footgun),
/// same as <see cref="PurchaseOrderLine"/>.
/// </summary>
public sealed class DirectGoodsReceiptLine : BaseEntity<Guid>
{
    public Guid DirectGoodsReceiptId { get; private set; }
    public Guid MedicineId { get; private set; }
    public decimal Quantity { get; private set; }
    public decimal UnitCostPrice { get; private set; }
    public decimal VatAmount { get; private set; }

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

    public decimal NetAmount => Quantity * UnitCostPrice;

    private DirectGoodsReceiptLine() { }

    internal static DirectGoodsReceiptLine Create(Guid medicineId, decimal quantity, decimal unitCostPrice, decimal vatAmount)
    {
        return new DirectGoodsReceiptLine
        {
            Id = Guid.CreateVersion7(),
            MedicineId = medicineId,
            Quantity = quantity,
            UnitCostPrice = unitCostPrice,
            VatAmount = vatAmount,
        };
    }

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
