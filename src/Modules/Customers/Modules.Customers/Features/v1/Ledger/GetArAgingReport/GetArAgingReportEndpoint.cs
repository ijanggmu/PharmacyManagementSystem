using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Customers.Contracts.Authorization;
using FSH.Modules.Customers.Contracts.v1.Ledger;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Customers.Features.v1.Ledger.GetArAgingReport;

public static class GetArAgingReportEndpoint
{
    internal static RouteHandlerBuilder MapGetArAgingReportEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/reports/ar-aging",
                (DateTime? asOfUtc, Guid? branchId, IMediator mediator, CancellationToken ct) =>
                    mediator.Send(new GetArAgingReportQuery(asOfUtc ?? DateTime.UtcNow, branchId), ct))
            .WithName("GetArAgingReport")
            .WithSummary("Accounts receivable aging — outstanding customer balances bucketed by age")
            .RequirePermission(CustomersPermissions.Ledger.View);
    }
}
