using Mediator;

namespace FSH.Modules.Purchasing.Contracts.v1.DirectGoodsReceipts;

/// <summary>One line of a direct (non-PO) goods receipt. Batch/expiry are required even though the
/// Next.js source (postDirectInventorySupplierReceipts) never asked for them — this .NET port's
/// Inventory model is batch-tracked for every stock addition, unlike the Supabase schema's flat
/// medicines.stock_quantity, so a batch identity must be supplied here to receive stock at all.
/// <para>
/// Supplier-bill terms, as on <c>PurchaseOrderLineInput</c>: <see cref="FreeQuantity"/> is bonus stock received
/// at no charge; <see cref="DiscountPercent"/>/<see cref="DiscountAmount"/> the trade discount (amount wins);
/// <see cref="VatAmount"/> the VAT on the line's discounted taxable value. With <see cref="InPacks"/> the quantity,
/// free quantity and unit cost are per pack of the medicine's <c>UnitsPerPack</c> (converted to base units);
/// <see cref="SellingPrice"/> is always per base unit. The lot receives quantity + free quantity at the effective
/// cost (net ÷ (quantity + free quantity)).
/// </para></summary>
public sealed record DirectGoodsReceiptLineInput(
    Guid MedicineId,
    string BatchNo,
    DateOnly ExpiryDate,
    decimal Quantity,
    decimal UnitCostPrice,
    decimal VatAmount = 0m,
    string? RackLocation = null,
    // Per-unit selling price for the new lot; null = the medicine's catalog price (never the cost price).
    decimal? SellingPrice = null,
    decimal FreeQuantity = 0m,
    decimal DiscountPercent = 0m,
    decimal DiscountAmount = 0m,
    bool InPacks = false);

/// <summary><see cref="BillDiscountPercent"/>/<see cref="BillDiscountAmount"/>: the bill-level (cash/trade)
/// discount (a positive amount wins), spread over the lines in proportion to their value after line discounts.</summary>
public sealed record CreateDirectGoodsReceiptCommand(
    Guid SupplierId,
    DateTime ReceiptDateUtc,
    string? SupplierInvoiceNumber,
    IReadOnlyList<DirectGoodsReceiptLineInput> Lines,
    // Set when the bill was paid at entry; null = on credit. Amount null = the full receipt total.
    DirectGoodsReceiptPaymentInput? Payment = null,
    decimal BillDiscountPercent = 0m,
    decimal BillDiscountAmount = 0m) : ICommand<Guid>;

/// <summary>"Paid at entry": how the receipt's bill was paid. <see cref="Amount"/> null = the full total;
/// <see cref="PaymentDateUtc"/> null = the receipt date.</summary>
public sealed record DirectGoodsReceiptPaymentInput(
    string Method,
    decimal? Amount = null,
    string? Reference = null,
    DateTime? PaymentDateUtc = null);
