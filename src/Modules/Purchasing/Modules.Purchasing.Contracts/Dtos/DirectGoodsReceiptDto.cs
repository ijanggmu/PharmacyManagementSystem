namespace FSH.Modules.Purchasing.Contracts.Dtos;

/// <summary>One receipt line; amounts as on <see cref="PurchaseOrderLineDto"/> (<see cref="NetAmount"/> is the
/// taxable value after line and bill discounts).</summary>
public sealed record DirectGoodsReceiptLineDto(
    Guid Id,
    Guid MedicineId,
    string? MedicineName,
    decimal Quantity,
    decimal UnitCostPrice,
    decimal VatAmount,
    decimal NetAmount,
    // The Inventory lot the line's stock went into; null on lines received before lots were recorded.
    Guid? BatchId = null,
    string? BatchNo = null,
    decimal FreeQuantity = 0m,
    decimal DiscountPercent = 0m,
    decimal DiscountAmount = 0m,
    decimal BillDiscountAmount = 0m,
    decimal GrossAmount = 0m,
    decimal EffectiveUnitCost = 0m,
    decimal? PackSize = null,
    decimal? PackUnitCost = null);

/// <summary><see cref="NetAmount"/> is the taxable value after discounts and <see cref="GrossAmount"/> the
/// supplier's bill (net + VAT); <see cref="SubtotalAmount"/> is before any discount. <see cref="PurchaseOrderId"/>/
/// <see cref="PurchaseOrderNumber"/> name the order this receipt delivered (null for a receipt without an order).</summary>
public sealed record DirectGoodsReceiptDto(
    Guid Id,
    Guid SupplierId,
    string? SupplierName,
    DateTime ReceiptDateUtc,
    string? SupplierInvoiceNumber,
    string Status,
    decimal NetAmount,
    decimal VatAmount,
    decimal GrossAmount,
    DateTime CreatedAtUtc,
    string CreatedBy,
    DateTime? VoidedAtUtc,
    string? VoidedBy,
    string? VoidReason,
    IReadOnlyList<DirectGoodsReceiptLineDto> Lines,
    Guid BranchId,
    // Serial number, e.g. GRN-MAIN-2083/84-00001; null only on a receipt not yet numbered.
    string? ReceiptNumber = null,
    // Fiscal year label, e.g. "2083/84".
    string? FiscalYear = null,
    decimal SubtotalAmount = 0m,
    decimal LineDiscountAmount = 0m,
    decimal BillDiscountPercent = 0m,
    decimal BillDiscountAmount = 0m,
    Guid? PurchaseOrderId = null,
    string? PurchaseOrderNumber = null);
