using FSH.Modules.Accounting.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Accounting.Contracts.v1.Reports;

/// <summary>Output VAT (2100) and input VAT (1150) on posted vouchers with a voucher date in
/// [<paramref name="FromUtc"/>, <paramref name="ToUtc"/>], optionally for one branch
/// (<paramref name="BranchId"/>; null = every branch the caller may see).</summary>
public sealed record GetVatReturnQuery(DateTime FromUtc, DateTime ToUtc, Guid? BranchId = null) : IQuery<VatReturnReportDto>;
