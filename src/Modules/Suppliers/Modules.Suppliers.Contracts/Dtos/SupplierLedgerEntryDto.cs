namespace FSH.Modules.Suppliers.Contracts.Dtos;

public sealed record SupplierLedgerEntryDto(
    Guid Id,
    Guid SupplierId,
    DateTime EntryDateUtc,
    string EntryType,
    string? Description,
    decimal DebitAmount,
    decimal CreditAmount,
    decimal RunningBalance,
    string? ReferenceType,
    Guid? ReferenceId,
    DateTime CreatedAtUtc,
    Guid? BranchId = null,
    // Our document number (GRN-…; on a bill payment, the bill's number) and the supplier's bill number.
    string? DocumentNumber = null,
    string? SupplierBillNumber = null,
    // True on a payment that has been voided (a reversing entry references it).
    bool IsVoided = false,
    // TDS withheld: on a payment, the part of the credit (the bill settled) that went to IRD instead of the
    // supplier; on an expense bill, what was withheld before the bill was put on the ledger. 0 without TDS.
    decimal TdsAmount = 0m);
