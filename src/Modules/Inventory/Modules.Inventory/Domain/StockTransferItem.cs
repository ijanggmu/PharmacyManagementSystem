using FSH.Framework.Core.Domain;

namespace FSH.Modules.Inventory.Domain;

/// <summary>
/// Reached ONLY through <see cref="StockTransfer"/>'s navigation collection — needs
/// <c>ValueGeneratedNever()</c> in its EF config (same nav-child footgun as
/// Purchasing's PurchaseOrderLine — database.md).
/// </summary>
public sealed class StockTransferItem : BaseEntity<Guid>
{
    public Guid StockTransferId { get; private set; }
    public Guid MedicineId { get; private set; }
    public decimal Quantity { get; private set; }

    private StockTransferItem() { }

    internal static StockTransferItem Create(Guid medicineId, decimal quantity) => new()
    {
        Id = Guid.CreateVersion7(),
        MedicineId = medicineId,
        Quantity = quantity,
    };

    internal void AssignTransfer(Guid stockTransferId) => StockTransferId = stockTransferId;
}
