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
public sealed class InventoryTransaction : AggregateRoot<Guid>, IAuditableEntity
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

    /// <summary>On a <see cref="InventoryTransactionType.SaleReversal"/> credit: the document whose stock is being
    /// put back (the original sale), when it differs from <see cref="ReferenceType"/>/<see cref="ReferenceId"/>
    /// (a customer return of that sale). Lets a later partial return of the same sale see what earlier returns
    /// already put back into each lot. Null on every other entry and on credits written before it was recorded.</summary>
    public string? OriginalReferenceType { get; private set; }

    /// <summary>See <see cref="OriginalReferenceType"/>.</summary>
    public Guid? OriginalReferenceId { get; private set; }

    /// <summary>On a restock credit: the lot the original document drew this stock from. Usually the lot credited
    /// (<see cref="MedicineBatchId"/>); differs when that lot was written off or moved and a live lot of the same
    /// batch number took the stock instead. Null when the stock could not be placed back into its own lot.</summary>
    public Guid? SourceBatchId { get; private set; }

    public DateTime CreatedAtUtc { get; private set; }

    // IAuditableEntity - stamped by AuditableEntitySaveChangesInterceptor with the signed-in user's id, so the
    // movement history can say who made each change. Null on movements saved before these columns existed and on
    // movements written by background handlers.
#pragma warning disable S1144 // Setters are written by EF (the interceptor sets them through the change tracker).
    public DateTimeOffset CreatedOnUtc { get; private set; }
    public string? CreatedBy { get; private set; }
    public DateTimeOffset? LastModifiedOnUtc { get; private set; }
    public string? LastModifiedBy { get; private set; }
#pragma warning restore S1144

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

    /// <summary>
    /// A <see cref="InventoryTransactionType.SaleReversal"/> credit putting stock from
    /// <paramref name="originalReferenceType"/>/<paramref name="originalReferenceId"/> back into
    /// <paramref name="medicineBatchId"/>, remembering which of the original document's lots it returns.
    /// </summary>
    public static InventoryTransaction CreateRestockCredit(
        Guid medicineId, Guid branchId, Guid medicineBatchId, decimal quantity, decimal unitCostPrice,
        string referenceType, Guid referenceId, string originalReferenceType, Guid originalReferenceId,
        Guid? sourceBatchId, string? notes)
    {
        var credit = Create(
            medicineId, branchId, medicineBatchId, InventoryTransactionType.SaleReversal, quantity, unitCostPrice,
            referenceType, referenceId, notes);
        credit.OriginalReferenceType = originalReferenceType;
        credit.OriginalReferenceId = originalReferenceId;
        credit.SourceBatchId = sourceBatchId;
        return credit;
    }
}
