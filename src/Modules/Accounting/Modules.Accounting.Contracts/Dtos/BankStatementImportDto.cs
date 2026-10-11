namespace FSH.Modules.Accounting.Contracts.Dtos;

public sealed record BankStatementLineDto(
    Guid Id,
    int LineNo,
    DateTime TxnDateUtc,
    string? Description,
    string? Reference,
    decimal DebitAmount,
    decimal CreditAmount,
    string Status,
    Guid? MatchedVoucherLineId,
    DateTime? MatchedAtUtc,
    string? MatchedBy,
    string? Note);

/// <summary>A posted GL line on the reconciled account within the statement period, flagged with
/// whether some statement line already claims it — mirrors <c>LedgerCandidate</c> in the Next.js
/// bank-reconciliation-service.ts.</summary>
public sealed record LedgerCandidateDto(
    Guid VoucherLineId,
    Guid VoucherId,
    string VoucherNo,
    DateTime VoucherDateUtc,
    string? Description,
    decimal DebitAmount,
    decimal CreditAmount,
    bool Matched);

public sealed record BankReconciliationSummaryDto(
    decimal StatementDebits,
    decimal StatementCredits,
    decimal StatementNet,
    decimal LedgerDebits,
    decimal LedgerCredits,
    decimal LedgerNet,
    decimal Difference,
    int UnmatchedStatementLines,
    int UnmatchedLedgerLines);

public sealed record BankStatementImportDto(
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
    IReadOnlyList<BankStatementLineDto> Lines,
    IReadOnlyList<LedgerCandidateDto> Ledger,
    BankReconciliationSummaryDto Summary,
    Guid? BranchId = null);

public sealed record AutoMatchResultDto(int MatchedCount);
