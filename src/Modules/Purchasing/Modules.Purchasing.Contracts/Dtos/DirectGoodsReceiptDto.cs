namespace FSH.Modules.Purchasing.Contracts.Dtos;

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
    string? BatchNo = null);

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
    string? FiscalYear = null);
