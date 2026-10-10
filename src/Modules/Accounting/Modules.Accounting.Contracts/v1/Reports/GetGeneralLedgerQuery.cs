using FSH.Modules.Accounting.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Accounting.Contracts.v1.Reports;

/// <summary>
/// General-ledger detail for one account over a period, with a running balance. The response's
/// <c>Lines</c> is paged via <paramref name="PageNumber"/>/<paramref name="PageSize"/>, but
/// <c>OpeningBalance</c> and <c>ClosingBalance</c> on the response always reflect the full period —
/// paging narrows which detail rows come back, never the balances.
/// </summary>
/// <param name="AccountId">The account to report on.</param>
/// <param name="FromUtc">Inclusive start of the period.</param>
/// <param name="ToUtc">Inclusive end of the period.</param>
/// <param name="BranchId">Optional branch filter.</param>
/// <param name="PageNumber">1-based page number (default 1).</param>
/// <param name="PageSize">Rows per page (default 50, max 200).</param>
public sealed record GetGeneralLedgerQuery(
    Guid AccountId,
    DateTime FromUtc,
    DateTime ToUtc,
    Guid? BranchId = null,
    int PageNumber = 1,
    int PageSize = 50) : IQuery<GeneralLedgerReportDto>;
