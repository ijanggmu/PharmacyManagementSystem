namespace FSH.Modules.Purchasing.Contracts.v1.PurchaseOrders;

/// <summary>
/// One ordered line. <see cref="BatchNo"/>, <see cref="ExpiryDate"/> and <see cref="SellingPrice"/> are
/// optional at order time; when left null they must be supplied on receipt
/// (see <see cref="PurchaseOrderLineReceiptInput"/>).
/// </summary>
public sealed record PurchaseOrderLineInput(
    Guid MedicineId,
    string? BatchNo,
    DateOnly? ExpiryDate,
    decimal Quantity,
    decimal UnitCostPrice,
    decimal? SellingPrice,
    string? RackLocation = null,
    decimal VatAmount = 0m);
