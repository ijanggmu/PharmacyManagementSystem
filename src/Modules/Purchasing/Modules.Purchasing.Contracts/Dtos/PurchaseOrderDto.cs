namespace FSH.Modules.Purchasing.Contracts.Dtos;

/// <summary>
/// One order line. Quantities are base units. <see cref="GrossAmount"/> = quantity × rate (packs × pack rate when
/// entered in packs); <see cref="NetAmount"/> = gross − <see cref="DiscountAmount"/> − <see cref="BillDiscountAmount"/>
/// (the taxable value VAT is charged on); <see cref="EffectiveUnitCost"/> = net ÷ (quantity + free quantity), the
/// cost each unit goes into stock at. <see cref="PackSize"/>/<see cref="PackUnitCost"/> are set when the line was
/// entered in packs.
/// </summary>
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
    decimal VatAmount,
    decimal FreeQuantity = 0m,
    decimal DiscountPercent = 0m,
    decimal DiscountAmount = 0m,
    decimal BillDiscountAmount = 0m,
    decimal GrossAmount = 0m,
    decimal NetAmount = 0m,
    decimal EffectiveUnitCost = 0m,
    decimal? PackSize = null,
    decimal? PackUnitCost = null);

/// <summary>
/// <see cref="TotalAmount"/> is the order's taxable net (after line and bill discounts); the supplier's bill is
/// <see cref="TotalAmount"/> + <see cref="TotalVatAmount"/>. <see cref="SubtotalAmount"/> is before any discount.
/// </summary>
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
    Guid? BranchId = null,
    decimal SubtotalAmount = 0m,
    decimal LineDiscountAmount = 0m,
    decimal BillDiscountPercent = 0m,
    decimal BillDiscountAmount = 0m);
