namespace FSH.Modules.Accounting.Contracts.Dtos;

/// <summary>A bank statement import without its lines or ledger view — the row shown in the statement list.</summary>
public sealed record BankStatementImportSummaryDto(
    Guid Id,
    Guid AccountId,
    string? StatementLabel,
    DateTime PeriodStartUtc,
    DateTime PeriodEndUtc,
    decimal? OpeningBalance,
    decimal? ClosingBalance,
    string Status,
    string CreatedBy,
    DateTime CreatedAtUtc,
    string? ReconciledBy,
    DateTime? ReconciledAtUtc,
    Guid? BranchId);
