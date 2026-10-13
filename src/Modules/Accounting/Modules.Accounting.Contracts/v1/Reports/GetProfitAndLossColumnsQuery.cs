using FSH.Modules.Accounting.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Accounting.Contracts.v1.Reports;

/// <summary>A reporting period (inclusive bounds, UTC instants).</summary>
public sealed record ReportPeriod(DateTime FromUtc, DateTime ToUtc);

/// <summary>P&amp;L for up to <see cref="MaxPeriods"/> periods side by side (comparatives, monthly trend).</summary>
public sealed record GetProfitAndLossColumnsQuery(IReadOnlyList<ReportPeriod> Periods, Guid? BranchId = null)
    : IQuery<ProfitAndLossColumnsDto>
{
    /// <summary>Twelve BS months plus a total or comparison column.</summary>
    public const int MaxPeriods = 13;
}
