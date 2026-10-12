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
    // The refund that pays the money back for this return, and its credit-note number. Null on returns
    // recorded before returns paid out through a refund, until they are completed.
    Guid? RefundId = null,
    string? CreditNoteNumber = null,
    // Of the money paid back, the part credited to the customer's account (the rest is paid out).
    decimal AccountCreditAmount = 0m);
