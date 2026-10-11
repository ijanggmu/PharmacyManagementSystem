using FSH.Framework.Core.Domain;

namespace FSH.Modules.Inventory.Domain;

/// <summary>
/// Tracks stock received on consignment — owned by the supplier until sold, settled periodically
/// rather than paid for on receipt. Each consignment shipment lands as its own <see cref="MedicineBatch"/>
/// (via the normal <c>IStockReceiptService.ReceiveAsync</c> — no changes needed there), so "quantity
/// sold to date" is simply <see cref="QuantityReceived"/> minus that batch's current
/// <c>QuantityOnHand</c> — no hook into FEFO deduction required. <see cref="SettledQuantity"/> is the
/// portion already paid for via a <c>ConsignmentSettlement</c>; the difference from quantity sold is
/// what the next settlement owes.
/// </summary>
public sealed class ConsignmentPosition : AggregateRoot<Guid>
{
    public Guid SupplierId { get; private set; }

    /// <summary>Nullable — NULL means legacy/tenant-wide (no branch resolved at receipt time), per
    /// docs/branch-scoping-plan.md's ledger/reporting-entity rule. Sourced via
    /// <c>ICurrentBranch.GetBranchIdAsync()</c> in <c>ReceiveConsignmentStockCommandHandler</c>.</summary>
    public Guid? BranchId { get; private set; }
    public Guid MedicineId { get; private set; }
    public Guid BatchId { get; private set; }
    public string BatchNo { get; private set; } = default!;
    public decimal QuantityReceived { get; private set; }
    public decimal UnitCostPrice { get; private set; }
    public decimal SettledQuantity { get; private set; }
    public DateTime ReceivedDateUtc { get; private set; }
    public DateTime CreatedAtUtc { get; private set; }

    private ConsignmentPosition() { }

    public static ConsignmentPosition Create(
        Guid supplierId, Guid medicineId, Guid batchId, string batchNo,
        decimal quantityReceived, decimal unitCostPrice, DateTime receivedDateUtc, Guid? branchId = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(batchNo);
        if (quantityReceived <= 0)
        {
            throw new ArgumentOutOfRangeException(nameof(quantityReceived), "Quantity received must be positive.");
        }

        return new ConsignmentPosition
        {
            Id = Guid.CreateVersion7(),
            SupplierId = supplierId,
            BranchId = branchId,
            MedicineId = medicineId,
            BatchId = batchId,
            BatchNo = batchNo,
            QuantityReceived = quantityReceived,
            UnitCostPrice = unitCostPrice,
            SettledQuantity = 0m,
            ReceivedDateUtc = receivedDateUtc,
            CreatedAtUtc = DateTime.UtcNow,
        };
    }

    /// <summary>Marks <paramref name="quantity"/> as settled (paid for) — called by
    /// <c>SettleConsignmentCommandHandler</c> for the quantity sold since the last settlement.</summary>
    public void MarkSettled(decimal quantity)
    {
        if (quantity <= 0)
        {
            throw new ArgumentOutOfRangeException(nameof(quantity), "Settled quantity must be positive.");
        }

        SettledQuantity += quantity;
    }
}
