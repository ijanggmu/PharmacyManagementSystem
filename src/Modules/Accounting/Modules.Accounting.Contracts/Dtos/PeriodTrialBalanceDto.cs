namespace FSH.Modules.Accounting.Contracts.Dtos;

/// <summary>One account of the period trial balance. All amounts are gross sums of ledger voucher lines.
/// <list type="bullet">
/// <item><c>Opening*</c> — every line dated before the period start.</item>
/// <item><c>Period*</c> — every line dated inside the period, <b>including</b> opening-balance vouchers.</item>
/// <item><c>OpeningVoucher*</c> — the part of <c>Period*</c> booked by opening-balance vouchers (and their
/// reversals) dated inside the period.</item>
/// <item><c>YearEndCloseVoucher*</c> — the part of <c>Period*</c> booked by year-end closing vouchers (and their
/// reversals) dated inside the period. Subtract it for the period's activity before the close (P&amp;L, activity
/// trial balance); keep it for balances.</item>
/// </list>
/// Closing = opening + period.</summary>
public sealed record PeriodTrialBalanceLineDto(
    Guid AccountId,
    string AccountCode,
    string AccountName,
    string AccountType,
    decimal OpeningDebit,
    decimal OpeningCredit,
    decimal PeriodDebit,
    decimal PeriodCredit,
    decimal OpeningVoucherDebit,
    decimal OpeningVoucherCredit,
    decimal YearEndCloseVoucherDebit = 0m,
    decimal YearEndCloseVoucherCredit = 0m);

/// <summary>An opening-balance voucher (or a reversal of one) dated inside the period.</summary>
public sealed record PeriodOpeningVoucherDto(Guid VoucherId, string VoucherNo, DateTime VoucherDateUtc, string VoucherType);

public sealed record PeriodTrialBalanceDto(
    DateTime FromUtc,
    DateTime ToUtc,
    Guid? BranchId,
    IReadOnlyList<PeriodTrialBalanceLineDto> Lines,
    IReadOnlyList<PeriodOpeningVoucherDto> OpeningVouchersInPeriod);
