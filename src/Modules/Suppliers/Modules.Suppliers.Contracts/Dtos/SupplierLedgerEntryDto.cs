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
    string? SupplierBillNumber = null);
