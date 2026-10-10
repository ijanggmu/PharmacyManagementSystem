using FSH.Modules.Accounting.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Accounting.Contracts.v1.Reports;

/// <summary>Reports overview KPIs (sales, inventory, prescriptions, trial balance) for a date range.
/// See <see cref="ReportsOverviewDto"/> remarks for how this relates to the Next.js reference.</summary>
public sealed record GetReportsOverviewQuery(DateTime FromUtc, DateTime ToUtc, Guid? BranchId = null) : IQuery<ReportsOverviewDto>;
