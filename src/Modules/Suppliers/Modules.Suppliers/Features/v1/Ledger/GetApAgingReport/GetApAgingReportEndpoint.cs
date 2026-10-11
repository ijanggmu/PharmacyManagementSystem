using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Suppliers.Contracts.Authorization;
using FSH.Modules.Suppliers.Contracts.v1.Ledger;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Suppliers.Features.v1.Ledger.GetApAgingReport;

public static class GetApAgingReportEndpoint
{
    internal static RouteHandlerBuilder MapGetApAgingReportEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/reports/ap-aging",
                (DateTime? asOfUtc, Guid? branchId, IMediator mediator, CancellationToken ct) =>
                    mediator.Send(new GetApAgingReportQuery(asOfUtc ?? DateTime.UtcNow, branchId), ct))
            .WithName("GetApAgingReport")
            .WithSummary("Accounts payable aging — outstanding supplier balances bucketed by age")
            .RequirePermission(SuppliersPermissions.Ledger.View);
    }
}
