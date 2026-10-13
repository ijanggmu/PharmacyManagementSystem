namespace FSH.Modules.Accounting.Contracts.Dtos;

/// <summary>An expense. <see cref="Amount"/> is the gross bill total; <see cref="VatAmount"/> the input VAT inside it.
/// <see cref="ExpenseAccountId"/>/<see cref="ExpenseAccountCode"/>/<see cref="ExpenseAccountName"/> name the ledger
/// account the net cost is booked to (General Expenses for expenses recorded before it could be chosen).
/// <see cref="SupplierId"/> is set on a pay-later expense (owed to that supplier).</summary>
public sealed record ExpenseDto(
    Guid Id,
    DateTime ExpenseDateUtc,
    string Category,
    decimal Amount,
    string PaymentMethod,
    string? Description,
    string RecordedBy,
    DateTime CreatedAtUtc,
    Guid? BranchId = null,
    string? ReceiptReference = null,
    Guid? ExpenseAccountId = null,
    string? ExpenseAccountCode = null,
    string? ExpenseAccountName = null,
    decimal VatAmount = 0m,
    string? SupplierVatNumber = null,
    string? VendorName = null,
    Guid? SupplierId = null);
