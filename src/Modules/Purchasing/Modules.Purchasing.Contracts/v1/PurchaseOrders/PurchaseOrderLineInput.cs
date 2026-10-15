namespace FSH.Modules.Purchasing.Contracts.v1.PurchaseOrders;

/// <summary>
/// One ordered line. <see cref="BatchNo"/>, <see cref="ExpiryDate"/> and <see cref="SellingPrice"/> are
/// optional at order time; when left null they must be supplied on receipt
/// (see <see cref="PurchaseOrderLineReceiptInput"/>).
/// <para>
/// Supplier-bill terms: <see cref="FreeQuantity"/> is the bonus quantity (received into stock at no charge, e.g.
/// the 1 of a 10+1 scheme); <see cref="DiscountPercent"/>/<see cref="DiscountAmount"/> the line's trade discount
/// (a positive amount wins over the percent). <see cref="VatAmount"/> is the input VAT on the line's DISCOUNTED
/// taxable value (after the line discount and its share of the bill discount — IRD charges VAT on the
/// discounted value). With <see cref="InPacks"/> the quantity, free quantity and unit cost are per pack of the
/// medicine's <c>UnitsPerPack</c> and are converted to base units; <see cref="SellingPrice"/> is always per base
/// unit.
/// </para>
/// </summary>
public sealed record PurchaseOrderLineInput(
    Guid MedicineId,
    string? BatchNo,
    DateOnly? ExpiryDate,
    decimal Quantity,
    decimal UnitCostPrice,
    decimal? SellingPrice,
    string? RackLocation = null,
    decimal VatAmount = 0m,
    decimal FreeQuantity = 0m,
    decimal DiscountPercent = 0m,
    decimal DiscountAmount = 0m,
    bool InPacks = false,
    // Quantity, free quantity and unit cost are per box (UnitsPerPack × PacksPerBox base units). Not with InPacks.
    bool InBoxes = false);
