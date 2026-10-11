namespace FSH.Modules.Sales.Contracts.Dtos;

public sealed record SaleRefundItemDto(
    Guid Id,
    Guid SaleItemId,
    Guid MedicineId,
    string? MedicineName,
    decimal QuantityRefunded,
    decimal UnitPrice,
    decimal TotalRefundAmount,
    bool IsTaxable = true,
    string? MedicineStrength = null,
    string? MedicineForm = null);

public sealed record SaleRefundDto(
    Guid Id,
    Guid OriginalSaleId,
    Guid? CustomerId,
    DateTime RefundDateUtc,
    string Status,
    string RefundReason,
    string RefundType,
    string RefundMethod,
    decimal RefundAmount,
    decimal TaxRefundAmount,
    decimal ProcessingFee,
    decimal NetRefundAmount,
    string RefundNumber,
    string? CreditNoteNumber,
    string? Notes,
    DateTime CreatedAtUtc,
    IReadOnlyList<SaleRefundItemDto> Items,
    Guid? BranchId = null,
    // Invoice number of the sale this credit note reverses.
    string? OriginalInvoiceNumber = null,
    // "2083/84" — fiscal year of the sequential credit-note number.
    string? FiscalYear = null,
    // VAT breakdown of the refunded lines; null when the original sale has none stored.
    decimal? VatRatePercent = null,
    decimal? TaxableAmount = null,
    decimal? VatAmount = null,
    decimal? ExemptAmount = null,
    // Times the credit note has been printed (GET by id only).
    int PrintCount = 0,
    // Resolved from Customers at read time.
    string? CustomerName = null);
