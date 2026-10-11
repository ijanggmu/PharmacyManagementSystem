using FSH.Modules.Purchasing.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Purchasing.Contracts.v1.Reports;

/// <summary>
/// .NET port of the <c>purchase-register</c>/<c>annex-14</c> report types from the Next.js reference's
/// <c>getIrdReportRows</c> (lib/server/services/reports-service.ts) — purchase orders with an
/// <c>OrderDateUtc</c> in [<paramref name="PeriodStartUtc"/>, <paramref name="PeriodEndUtc"/>]. See
/// <see cref="IrdPurchaseRegisterRowDto"/> for the faithfulness gap.
/// </summary>
public sealed record GetIrdPurchaseRegisterQuery(DateTime PeriodStartUtc, DateTime PeriodEndUtc, Guid? BranchId = null)
    : IQuery<IReadOnlyList<IrdPurchaseRegisterRowDto>>;
