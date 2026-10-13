namespace FSH.Modules.Sales.Contracts.Dtos;

public sealed record SaleItemDto(
    Guid Id,
    Guid MedicineId,
    string? MedicineName,
    decimal Quantity,
    decimal UnitPrice,
    decimal DiscountAmount,
    decimal UnitCostPrice,
    decimal LineTotal,
    decimal DiscountPercent = 0m,
    bool IsTaxable = true,
    // Display fields resolved from Inventory at read time (null when the medicine is unknown).
    string? MedicineGenericName = null,
    string? MedicineStrength = null,
    string? MedicineForm = null,
    // Units of this line already given back on non-rejected returns / refunds (GET by id only; 0 in lists).
    // What is still returnable is Quantity - ReturnedQuantity - RefundedQuantity.
    decimal ReturnedQuantity = 0m,
    decimal RefundedQuantity = 0m,
    // The batch (lot) the line was sold from; null on lines sold before sales recorded batches.
    Guid? BatchId = null,
    string? BatchNo = null,
    // Set when the line was sold in packs: UnitsPerPack base units make one PackLabel ("strip"), so the invoice
    // reads "2 strips (20 tablets)". Quantity (and every price/return figure) is still in base units.
    int? SoldUnitsPerPack = null,
    string? SoldPackLabel = null,
    string? BaseUnitLabel = null);

/// <summary>One tender leg of a sale (split tender). <c>Amount</c> is what was tendered; a
/// <c>credit</c> leg is the on-account portion.</summary>
public sealed record SalePaymentDto(
    Guid Id,
    string Method,
    decimal Amount,
    string? Reference);

public sealed record SaleDto(
    Guid Id,
    Guid? CustomerId,
    string? CustomerName,
    DateTime SaleDateUtc,
    string Status,
    string PaymentMethod,
    decimal PaymentAmount,
    decimal TotalAmount,
    decimal BalanceDue,
    Guid? PrescriptionId,
    string? Notes,
    DateTime CreatedAtUtc,
    DateTime? CancelledAtUtc,
    string? CancelReason,
    IReadOnlyList<SaleItemDto> Items,
    IReadOnlyList<SalePaymentDto> Payments,
    Guid? CashierUserId = null,
    Guid? BranchId = null,
    // Sequential IRD invoice number, e.g. INV-MAIN-2083/84-00001. Null on older sales never sent to IRD.
    string? InvoiceNumber = null,
    // "2083/84" — the Nepali fiscal year the invoice number belongs to.
    string? FiscalYear = null,
    // VAT breakdown — null on sales recorded before it was stored.
    decimal? VatRatePercent = null,
    decimal? TaxableAmount = null,
    decimal? VatAmount = null,
    decimal? ExemptAmount = null,
    // How many times the invoice has been printed (GET by id only; 0 in lists).
    int PrintCount = 0,
    // Resolved from Customers at read time; null for walk-in sales or an unknown customer.
    string? CustomerPhone = null,
    // Buyer name / PAN recorded for the tax invoice (IRD). Null = the customer's name / no PAN.
    string? BuyerName = null,
    string? BuyerPan = null);
