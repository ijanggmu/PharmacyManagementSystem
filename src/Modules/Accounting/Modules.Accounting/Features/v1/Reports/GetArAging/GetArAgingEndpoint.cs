using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Accounting.Contracts.Authorization;
using FSH.Modules.Customers.Contracts.v1.Ledger;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Accounting.Features.v1.Reports.GetArAging;

/// <summary>
/// Accounts receivable aging, delegated to the Customers sub-ledger through its Contracts query.
/// An omitted branch falls back to the caller's branch scope (null for callers with branch view-all).
/// </summary>
public static class GetArAgingEndpoint
{
    internal static RouteHandlerBuilder MapGetArAgingEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/reports/ar-aging",
                async (DateTime? asOfUtc, Guid? branchId, IMediator mediator, ICurrentBranch currentBranch, CancellationToken ct) =>
                {
                    var scope = await currentBranch.ResolveListBranchFilterAsync(branchId, ct).ConfigureAwait(false);
                    return await mediator.Send(new GetArAgingReportQuery(asOfUtc ?? DateTime.UtcNow, scope), ct).ConfigureAwait(false);
                })
            .WithName("GetAccountingArAging")
            .WithSummary("Accounts receivable aging — outstanding customer balances bucketed by age")
            .RequirePermission(AccountingPermissions.Reports.View);
    }
}
