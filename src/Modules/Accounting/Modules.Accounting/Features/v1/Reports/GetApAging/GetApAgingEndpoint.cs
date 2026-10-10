using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Accounting.Contracts.Authorization;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Suppliers.Contracts.v1.Ledger;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Accounting.Features.v1.Reports.GetApAging;

/// <summary>
/// Accounts payable aging, delegated to the Suppliers sub-ledger through its Contracts query.
/// An omitted branch falls back to the caller's branch scope (null for callers with branch view-all).
/// </summary>
public static class GetApAgingEndpoint
{
    internal static RouteHandlerBuilder MapGetApAgingEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/reports/ap-aging",
                async (DateTime? asOfUtc, Guid? branchId, IMediator mediator, ICurrentBranch currentBranch, CancellationToken ct) =>
                {
                    var scope = await currentBranch.ResolveListBranchFilterAsync(branchId, ct).ConfigureAwait(false);
                    return await mediator.Send(new GetApAgingReportQuery(asOfUtc ?? DateTime.UtcNow, scope), ct).ConfigureAwait(false);
                })
            .WithName("GetAccountingApAging")
            .WithSummary("Accounts payable aging — outstanding supplier balances bucketed by age")
            .RequirePermission(AccountingPermissions.Reports.View);
    }
}
