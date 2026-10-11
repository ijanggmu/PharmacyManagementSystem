using Mediator;

namespace FSH.Modules.Purchasing.Contracts.v1.DirectGoodsReceipts;

/// <summary>One line of a direct (non-PO) goods receipt. Batch/expiry are required even though the
/// Next.js source (postDirectInventorySupplierReceipts) never asked for them — this .NET port's
/// Inventory model is batch-tracked for every stock addition, unlike the Supabase schema's flat
/// medicines.stock_quantity, so a batch identity must be supplied here to receive stock at all.</summary>
public sealed record DirectGoodsReceiptLineInput(
    Guid MedicineId,
    string BatchNo,
    DateOnly ExpiryDate,
    decimal Quantity,
    decimal UnitCostPrice,
    decimal VatAmount = 0m,
    string? RackLocation = null,
    // Per-unit selling price for the new lot; null = the medicine's catalog price (never the cost price).
    decimal? SellingPrice = null);

public sealed record CreateDirectGoodsReceiptCommand(
    Guid SupplierId,
    DateTime ReceiptDateUtc,
    string? SupplierInvoiceNumber,
    IReadOnlyList<DirectGoodsReceiptLineInput> Lines,
    // Set when the bill was paid at entry; null = on credit. Amount null = the full receipt total.
    DirectGoodsReceiptPaymentInput? Payment = null) : ICommand<Guid>;

/// <summary>"Paid at entry": how the receipt's bill was paid. <see cref="Amount"/> null = the full total;
/// <see cref="PaymentDateUtc"/> null = the receipt date.</summary>
public sealed record DirectGoodsReceiptPaymentInput(
    string Method,
    decimal? Amount = null,
    string? Reference = null,
    DateTime? PaymentDateUtc = null);
