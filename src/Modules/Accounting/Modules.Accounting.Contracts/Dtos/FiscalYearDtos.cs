namespace FSH.Modules.Accounting.Contracts.Dtos;

/// <summary>
/// One Nepali fiscal year (1 Shrawan – end of Ashadh) and its close status. <see cref="FiscalYear"/> is the BS year
/// it started in (2082 for 2082/83); <see cref="StartDate"/>/<see cref="EndDate"/> are its first and last Nepal
/// calendar days (AD). <see cref="HasEnded"/> is true once its last day is before today (Nepal time) — only then can
/// it be closed. The close fields are set while the year is closed.
/// </summary>
public sealed record FiscalYearStatusDto(
    int FiscalYear,
    string Label,
    DateOnly StartDate,
    DateOnly EndDate,
    bool HasEnded,
    bool IsClosed,
    DateTime? ClosedAtUtc,
    string? ClosedBy,
    decimal? NetProfit,
    IReadOnlyList<string> ClosingVoucherNos);

/// <summary>Result of closing a fiscal year: the closing vouchers posted (one per branch with revenue or expense
/// balances), the net profit transferred to Retained Earnings and the posting-lock date afterwards.</summary>
public sealed record FiscalYearCloseResultDto(
    int FiscalYear,
    string Label,
    DateOnly EndDate,
    decimal NetProfit,
    IReadOnlyList<Guid> ClosingVoucherIds,
    DateOnly? LockDate,
    DateTime ClosedAtUtc,
    string ClosedBy);

/// <summary>Result of reopening a fiscal year: the reversing vouchers posted. The posting lock is left unchanged.</summary>
public sealed record FiscalYearReopenResultDto(
    int FiscalYear,
    string Label,
    IReadOnlyList<Guid> ReversalVoucherIds,
    DateOnly? LockDate);
