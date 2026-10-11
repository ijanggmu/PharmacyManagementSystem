using FSH.Framework.Core.Domain;

namespace FSH.Modules.Inventory.Domain;

public enum InventoryTransactionType
{
    Purchase = 0,
    Sale = 1,
    Adjustment = 2,
    Transfer = 3,
    Dispose = 4,
    SaleReversal = 5,

    /// <summary>Stock deducted for goods physically handed back to a supplier — see
    /// <c>IStockDeductionService.DeductForSupplierReturnAsync</c>.</summary>
    SupplierReturn = 6,

    /// <summary>Audit marker for a batch recall. Zero quantity change: a recalled lot keeps its
    /// QuantityOnHand and is blocked from sale by <see cref="MedicineBatch.IsRecalled"/>.</summary>
    Recall = 7,

    /// <summary>Stock taken back out of the lots a goods receipt created, because the receipt was voided —
    /// see <c>IStockReceiptService.ReverseReceiptAsync</c>. Not a sale and not a supplier return.</summary>
    PurchaseReversal = 8,
}

/// <summary>
/// Append-only audit trail of every stock movement. Independent entity (own DbSet), inserted
/// alongside a <see cref="MedicineBatch"/> mutation — never updated or deleted.
/// </summary>
public sealed class InventoryTransaction : AggregateRoot<Guid>
{
    public Guid MedicineId { get; private set; }

    /// <summary>The branch this stock movement belongs to — required, resolved via
    /// <c>ICurrentBranch</c> at creation (see docs/branch-scoping-plan.md). For stock-transfer legs
    /// this is the transfer's <c>FromBranchId</c>/<c>ToBranchId</c> depending on direction, not the
    /// caller's ambient branch.</summary>
    public Guid BranchId { get; private set; }

    /// <summary>Null for ledger entries that are not attributed to a single batch (e.g. a medicine-level
    /// adjustment). Stock-transfer legs now move whole batches and record the batch here.</summary>
    public Guid? MedicineBatchId { get; private set; }
    public InventoryTransactionType Type { get; private set; }

    /// <summary>Signed: positive increases on-hand quantity, negative decreases it.</summary>
    public decimal QuantityDelta { get; private set; }
    public decimal UnitCostPrice { get; private set; }
    public string? ReferenceType { get; private set; }
    public Guid? ReferenceId { get; private set; }
    public string? Notes { get; private set; }
    public DateTime CreatedAtUtc { get; private set; }

    private InventoryTransaction() { }

    public static InventoryTransaction Create(
        Guid medicineId, Guid branchId, Guid? medicineBatchId, InventoryTransactionType type, decimal quantityDelta,
        decimal unitCostPrice, string? referenceType = null, Guid? referenceId = null, string? notes = null)
    {
        return new InventoryTransaction
        {
            Id = Guid.CreateVersion7(),
            MedicineId = medicineId,
            BranchId = branchId,
            MedicineBatchId = medicineBatchId,
            Type = type,
            QuantityDelta = quantityDelta,
            UnitCostPrice = unitCostPrice,
            ReferenceType = referenceType,
            ReferenceId = referenceId,
            Notes = notes?.Trim(),
            CreatedAtUtc = DateTime.UtcNow,
        };
    }
}
