namespace FSH.Modules.Suppliers.Contracts.Dtos;

/// <summary>One ledger line within a statement period — mirrors <c>SupplierStatementLine</c>
/// (supplier-statement-service.ts). A voided payment stays on the statement (the money did move, and its void is a
/// later line that reverses it) but is flagged <see cref="IsVoided"/>; the void's own line has
/// <see cref="VoidsEntryId"/> pointing back at it, so the pair can be shown together.</summary>
public sealed record SupplierStatementLineDto(
    Guid Id,
    DateTime EntryDateUtc,
    string EntryType,
    string? ReferenceType,
    Guid? ReferenceId,
    string? Description,
    decimal DebitAmount,
    decimal CreditAmount,
    decimal RunningBalance,
    Guid? BranchId = null,
    string? DocumentNumber = null,
    string? SupplierBillNumber = null,
    // True on a payment that has since been voided.
    bool IsVoided = false,
    // On the entry that voids a payment: that payment's entry id.
    Guid? VoidsEntryId = null,
    // The payment's own voucher number (SPM-…); null on other entries.
    string? PaymentNumber = null);

/// <summary>AP statement over a date range: opening balance, the lines that moved it, and the
/// closing balance — mirrors <c>supplierStatementReport</c> (supplier-statement-service.ts).</summary>
public sealed record SupplierStatementDto(
    Guid SupplierId,
    DateTime PeriodFromUtc,
    DateTime PeriodToUtc,
    decimal OpeningBalance,
    decimal ClosingBalance,
    IReadOnlyList<SupplierStatementLineDto> Lines);
