namespace FSH.Modules.Sales.Contracts.Dtos;

public sealed record SaleReturnItemDto(
    Guid Id,
    Guid SaleItemId,
    Guid MedicineId,
    string? MedicineName,
    decimal QuantityReturned,
    decimal UnitPrice,
    decimal TotalAmount,
    string Reason,
    string PackagingCondition,
    string? MedicineStrength = null,
    string? MedicineForm = null);

public sealed record SaleReturnDto(
    Guid Id,
    Guid SaleId,
    Guid? CustomerId,
    DateTime ReturnDateUtc,
    string Status,
    string ReturnReason,
    string? Notes,
    decimal TotalReturnAmount,
    DateTime CreatedAtUtc,
    DateTime? StockRestoredAtUtc,
    IReadOnlyList<SaleReturnItemDto> Items,
    // Resolved at read time: the customer's name and the returned sale's invoice number.
    string? CustomerName = null,
    string? SaleInvoiceNumber = null,
    Guid? BranchId = null,
    // How the money goes back: original_payment | cash | store_credit | a payment method.
    string? RefundMethod = null,
    // Settlement split recorded at completion (null until completed): cash out of the drawer, to the
    // bank/card/wallet, and credited to the customer's account. The three add up to TotalReturnAmount.
    decimal? SettlementCashAmount = null,
    decimal? SettlementBankAmount = null,
    decimal? SettlementOnAccountAmount = null,
    // Sequential IRD credit-note number, assigned at completion; "2083/84" fiscal year label of it.
    string? CreditNoteNumber = null,
    string? FiscalYear = null);
