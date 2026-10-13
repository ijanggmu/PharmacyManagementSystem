using Mediator;

namespace FSH.Modules.Inventory.Contracts.v1.Batches;

/// <summary>Manual/opening-stock batch entry — not the Purchasing receipt path (that goes through
/// IStockReceiptService so it stays reference-tracked to a purchase order). A manual batch has no
/// supplier bill, so <see cref="StockFunding"/> (see StockFundingSources) says how it was paid for:
/// "opening_stock" (default when omitted), "cash" or "bank".</summary>
public sealed record CreateBatchCommand(
    Guid MedicineId,
    string BatchNo,
    DateOnly ExpiryDate,
    decimal Quantity,
    decimal CostPrice,
    decimal SellingPrice,
    string? RackLocation = null,
    string? StockFunding = null) : ICommand<Guid>;
