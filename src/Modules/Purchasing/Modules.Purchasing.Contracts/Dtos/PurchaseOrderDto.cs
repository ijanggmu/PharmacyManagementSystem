namespace FSH.Modules.Purchasing.Contracts.Dtos;

public sealed record PurchaseOrderLineDto(
    Guid Id,
    Guid MedicineId,
    string? MedicineName,
    string? BatchNo,
    DateOnly? ExpiryDate,
    decimal Quantity,
    decimal UnitCostPrice,
    decimal? SellingPrice,
    string? RackLocation,
    decimal VatAmount);

public sealed record PurchaseOrderDto(
    Guid Id,
    Guid SupplierId,
    string? SupplierName,
    DateTime OrderDateUtc,
    string Status,
    string? Narration,
    decimal TotalAmount,
    DateTime CreatedAtUtc,
    DateTime? ApprovedAtUtc,
    string? ApprovedBy,
    DateTime? ReceivedAtUtc,
    string? ReceivedBy,
    DateTime? CancelledAtUtc,
    string? CancelReason,
    string? SupplierInvoiceNumber,
    decimal TotalVatAmount,
    IReadOnlyList<PurchaseOrderLineDto> Lines,
    // Ordering/receiving branch; null on legacy orders not yet backfilled.
    Guid? BranchId = null);
