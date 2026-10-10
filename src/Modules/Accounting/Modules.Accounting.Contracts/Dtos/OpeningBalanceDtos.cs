namespace FSH.Modules.Accounting.Contracts.Dtos;

/// <summary>One account's opening balance. Exactly one of <see cref="DebitAmount"/> /
/// <see cref="CreditAmount"/> is greater than zero.</summary>
public sealed record OpeningBalanceLineDto(
    Guid AccountId,
    string AccountCode,
    string AccountName,
    string AccountType,
    decimal DebitAmount,
    decimal CreditAmount);

/// <summary>
/// The active opening balances of one branch. <see cref="IsSet"/> is false before the first Set and
/// after a Reset. <see cref="Version"/> is the sequence of the latest history entry (0 when none) and
/// must be echoed back as <c>ExpectedVersion</c> on Edit/Reset. <see cref="LegacyOpeningVoucherCount"/>
/// counts posted vouchers from the onboarding migration wizard, whose amounts are already in the ledger.
/// </summary>
public sealed record OpeningBalanceStateDto(
    Guid BranchId,
    bool IsSet,
    DateOnly? OpeningDate,
    Guid? VoucherId,
    string? VoucherNo,
    decimal TotalDebit,
    decimal TotalCredit,
    decimal EquityAdjustmentDebit,
    decimal EquityAdjustmentCredit,
    Guid? EquityAccountId,
    string EquityAccountCode,
    string? EquityAccountName,
    IReadOnlyList<OpeningBalanceLineDto> Lines,
    int Version,
    DateTime? LastChangedAtUtc,
    string? LastChangedBy,
    DateOnly? PostingLockDate,
    int LegacyOpeningVoucherCount);

/// <summary>Per-account change recorded in a history entry (before → after).</summary>
public sealed record OpeningBalanceChangeDto(
    Guid AccountId,
    string AccountCode,
    string AccountName,
    decimal BeforeDebit,
    decimal BeforeCredit,
    decimal AfterDebit,
    decimal AfterCredit);

/// <summary>One Set / Edit / Reset of a branch's opening balances.</summary>
public sealed record OpeningBalanceHistoryEntryDto(
    Guid Id,
    int Sequence,
    string Action,
    Guid BranchId,
    DateOnly? OpeningDate,
    DateOnly? PreviousOpeningDate,
    Guid? PostedVoucherId,
    string? PostedVoucherNo,
    Guid? ReversedVoucherId,
    string? ReversedVoucherNo,
    Guid? ReversalVoucherId,
    string? ReversalVoucherNo,
    decimal TotalDebit,
    decimal TotalCredit,
    decimal EquityAdjustmentDebit,
    decimal EquityAdjustmentCredit,
    string? Reason,
    Guid PerformedByUserId,
    string PerformedByName,
    DateTime PerformedAtUtc,
    IReadOnlyList<OpeningBalanceChangeDto> Changes);

/// <summary>Result of Set / Edit / Reset. A retried request (same <c>RequestId</c>) returns the original result.</summary>
public sealed record OpeningBalanceMutationResultDto(
    Guid HistoryEntryId,
    string Action,
    int Version,
    Guid? PostedVoucherId,
    Guid? ReversedVoucherId,
    Guid? ReversalVoucherId);
