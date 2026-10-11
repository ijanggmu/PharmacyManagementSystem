using FSH.Framework.Shared.Persistence;

namespace FSH.Modules.Accounting.Contracts.Dtos;

public sealed record GeneralLedgerLineDto(
    Guid VoucherId,
    string VoucherNo,
    DateTime VoucherDateUtc,
    string? Narration,
    decimal DebitAmount,
    decimal CreditAmount,
    decimal RunningBalance);

/// <summary>
/// One account's posted activity in [FromUtc, ToUtc], with a running balance seeded from
/// <see cref="OpeningBalance"/> (everything posted before <c>FromUtc</c>). The sign convention
/// follows the account's normal balance — Asset/Expense accumulate debit-positive,
/// Liability/Equity/Revenue accumulate credit-positive — same rule <c>GetBalanceSheetQuery</c> and
/// <c>GetProfitAndLossQuery</c> use.
///
/// <c>Lines</c> carries only the requested page of detail rows (see the query's
/// PageNumber/PageSize), but each row's
/// <see cref="GeneralLedgerLineDto.RunningBalance"/> is still correct for its position in the full
/// period — it is seeded from everything posted before the page, not just rows shown on it.
/// <see cref="OpeningBalance"/> and <see cref="ClosingBalance"/> always cover the whole period
/// regardless of which page was requested.
/// </summary>
public sealed record GeneralLedgerReportDto(
    Guid AccountId,
    string AccountCode,
    string AccountName,
    string AccountType,
    DateTime FromUtc,
    DateTime ToUtc,
    decimal OpeningBalance,
    PagedResponse<GeneralLedgerLineDto> Lines,
    decimal ClosingBalance);
