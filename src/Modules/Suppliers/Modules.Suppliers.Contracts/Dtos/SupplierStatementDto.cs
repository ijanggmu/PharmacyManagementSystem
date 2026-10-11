namespace FSH.Modules.Suppliers.Contracts.Dtos;

/// <summary>One ledger line within a statement period — mirrors <c>SupplierStatementLine</c>
/// (supplier-statement-service.ts).</summary>
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
    string? SupplierBillNumber = null);

/// <summary>AP statement over a date range: opening balance, the lines that moved it, and the
/// closing balance — mirrors <c>supplierStatementReport</c> (supplier-statement-service.ts).</summary>
public sealed record SupplierStatementDto(
    Guid SupplierId,
    DateTime PeriodFromUtc,
    DateTime PeriodToUtc,
    decimal OpeningBalance,
    decimal ClosingBalance,
    IReadOnlyList<SupplierStatementLineDto> Lines);
