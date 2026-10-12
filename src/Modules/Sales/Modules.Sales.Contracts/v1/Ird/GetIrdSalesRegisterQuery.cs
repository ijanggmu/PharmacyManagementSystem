using FSH.Modules.Sales.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Sales.Contracts.v1.Ird;

/// <summary>
/// .NET port of the <c>sales-register</c> and <c>annex-13</c> report types from the Next.js reference's
/// <c>getIrdReportRows</c> (lib/server/services/reports-service.ts, served by GET
/// <c>/api/reports/ird?type=sales-register|annex-13</c>) — every invoice issued with a <c>SaleDateUtc</c> in
/// [<paramref name="PeriodStartUtc"/>, <paramref name="PeriodEndUtc"/>] (a later cancellation does NOT remove it
/// from its period), plus negative reversal rows for cancellations, completed returns and completed refunds
/// dated within the period, scoped to the caller's current
/// branch (<c>ICurrentBranch.GetListFilterBranchIdAsync</c> — unfiltered only for a caller holding
/// <c>Branches.ViewAll</c>). See <see cref="Dtos.IrdSalesRegisterRowDto"/> for the faithfulness gap.
/// </summary>
public sealed record GetIrdSalesRegisterQuery(DateTime PeriodStartUtc, DateTime PeriodEndUtc, Guid? BranchId = null)
    : IQuery<IReadOnlyList<IrdSalesRegisterRowDto>>;
