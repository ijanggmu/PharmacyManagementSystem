using FSH.Modules.Accounting.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Accounting.Contracts.v1.Reports;

/// <summary>TDS deductions dated in [<paramref name="FromUtc"/>, <paramref name="ToUtc"/>] (normally one Nepali month)
/// whose voucher is still posted, optionally for one branch (<paramref name="BranchId"/>; null = every branch the
/// caller may see).</summary>
public sealed record GetTdsReportQuery(DateTime FromUtc, DateTime ToUtc, Guid? BranchId = null) : IQuery<TdsReportDto>;
