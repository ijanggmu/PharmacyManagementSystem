using FSH.Modules.Inventory.Data;
using FSH.Modules.Inventory.Domain;

namespace FSH.Modules.Inventory.Services;

/// <summary>
/// The stock side of a quantity adjustment, shared by a single-lot correction (AdjustBatchQuantity) and a
/// stock count posting: sets a LOCKED lot to its new quantity and records the change as an
/// <see cref="InventoryTransactionType.Adjustment"/> movement at the lot's cost. The GL side is published by
/// the caller through <see cref="InventoryAdjustmentPublisher"/> (consigned lots post nothing).
/// </summary>
internal static class BatchAdjustmentWriter
{
    /// <summary>Returns the signed quantity change (zero = nothing recorded).</summary>
    public static decimal Apply(
        InventoryDbContext dbContext, MedicineBatch batch, decimal newQuantity, string? notes,
        string? referenceType = null, Guid? referenceId = null)
    {
        ArgumentNullException.ThrowIfNull(dbContext);
        ArgumentNullException.ThrowIfNull(batch);

        decimal delta = batch.SetQuantity(newQuantity);
        if (delta != 0)
        {
            dbContext.InventoryTransactions.Add(InventoryTransaction.Create(
                batch.MedicineId, batch.BranchId, batch.Id, InventoryTransactionType.Adjustment, delta,
                batch.CostPrice, referenceType, referenceId, notes));
        }

        return delta;
    }
}
