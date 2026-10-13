namespace FSH.Modules.Purchasing.Contracts.v1.PurchaseOrders;

/// <summary>
/// What arrived for one order line. Batch number, expiry and selling price fill only the details the
/// line does not already have from order time. <see cref="QuantityReceived"/> is the quantity that
/// actually arrived (0 up to the ordered quantity); null means the full ordered quantity.
/// <see cref="FreeQuantityReceived"/> is the free (bonus) quantity that arrived (0 up to the ordered free
/// quantity); null means the ordered free quantity in proportion to the paid quantity received, rounded down to
/// whole units. Both are in base units.
/// </summary>
public sealed record PurchaseOrderLineReceiptInput(
    Guid LineId,
    string? BatchNo,
    DateOnly? ExpiryDate,
    decimal? SellingPrice,
    decimal? QuantityReceived = null,
    decimal? FreeQuantityReceived = null);
