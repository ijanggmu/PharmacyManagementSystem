using FSH.Framework.Core.Domain;

namespace FSH.Modules.Inventory.Domain;

/// <summary>
/// One FEFO allocation of a stock transfer: the quantity taken from a single source
/// <see cref="MedicineBatch"/> at dispatch. Receive and cancel use it to recreate or increase the batch at
/// the destination or source branch with the same batch number, expiry, and cost, so a transferred lot
/// keeps its identity. Written once at dispatch and never modified.
/// </summary>
public sealed class StockTransferBatch : BaseEntity<Guid>
{
    public Guid StockTransferId { get; private set; }
    public Guid MedicineId { get; private set; }
    public Guid SourceBatchId { get; private set; }
    public string BatchNo { get; private set; } = default!;
    public DateOnly ExpiryDate { get; private set; }
    public decimal Quantity { get; private set; }
    public decimal CostPrice { get; private set; }
    public decimal SellingPrice { get; private set; }

    private StockTransferBatch() { }

    public static StockTransferBatch Create(
        Guid stockTransferId, Guid medicineId, Guid sourceBatchId, string batchNo, DateOnly expiryDate,
        decimal quantity, decimal costPrice, decimal sellingPrice)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(batchNo);
        if (quantity <= 0)
        {
            throw new ArgumentOutOfRangeException(nameof(quantity), quantity, "Allocated quantity must be positive.");
        }

        return new StockTransferBatch
        {
            Id = Guid.CreateVersion7(),
            StockTransferId = stockTransferId,
            MedicineId = medicineId,
            SourceBatchId = sourceBatchId,
            BatchNo = batchNo.Trim(),
            ExpiryDate = expiryDate,
            Quantity = quantity,
            CostPrice = costPrice,
            SellingPrice = sellingPrice,
        };
    }
}
