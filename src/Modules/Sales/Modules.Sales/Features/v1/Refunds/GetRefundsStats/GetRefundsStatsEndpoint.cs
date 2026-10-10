using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Sales.Contracts.Authorization;
using FSH.Modules.Sales.Contracts.v1.Refunds;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Sales.Features.v1.Refunds.GetRefundsStats;

public static class GetRefundsStatsEndpoint
{
    internal static RouteHandlerBuilder MapGetRefundsStatsEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/refunds/stats",
                (Guid? branchId, IMediator mediator, CancellationToken ct) =>
                    mediator.Send(new GetRefundsStatsQuery(branchId), ct))
            .WithName("GetRefundsStats")
            .WithSummary("Refunds stats (counts by status, total net refund amount)")
            .RequirePermission(SalesPermissions.Refunds.View);
    }
}
