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
    // The batch (lot) this line was sold from, at that batch's price. Null on lines sold before batch tracking.
    string? BatchNo = null);

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
    string? CustomerPhone = null);
