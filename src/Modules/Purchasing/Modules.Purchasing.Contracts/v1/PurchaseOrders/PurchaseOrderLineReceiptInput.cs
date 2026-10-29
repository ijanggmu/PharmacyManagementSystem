namespace FSH.Modules.Purchasing.Contracts.v1.PurchaseOrders;

/// <summary>
/// What arrived for one order line, as on the supplier's bill. What arrived wins over the order: a batch number,
/// expiry or selling price given here replaces the one entered at order time (blank keeps it).
/// <see cref="QuantityReceived"/> is the quantity that actually arrived (0 up to the ordered quantity); null means
/// the full ordered quantity. <see cref="FreeQuantityReceived"/> is the free (bonus) quantity that arrived (0 or
/// more — a supplier may add bonus goods beyond the order); null means the ordered free quantity in proportion to
/// the paid quantity received, rounded down to whole units. Both are in base units. <see cref="Rate"/> is the rate
/// the supplier billed, in the unit the line was ordered in (per pack/box for a line ordered in packs or boxes,
/// otherwise per base unit); null means the ordered rate. A changed rate re-works the line's discount (when it was
/// a percent), its share of a percent bill discount and its VAT (in proportion to the new taxable value).
/// </summary>
public sealed record PurchaseOrderLineReceiptInput(
    Guid LineId,
    string? BatchNo,
    DateOnly? ExpiryDate,
    decimal? SellingPrice,
    decimal? QuantityReceived = null,
    decimal? FreeQuantityReceived = null,
    decimal? Rate = null);
