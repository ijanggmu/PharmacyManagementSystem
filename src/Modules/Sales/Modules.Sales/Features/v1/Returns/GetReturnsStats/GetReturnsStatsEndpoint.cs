using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Sales.Contracts.Authorization;
using FSH.Modules.Sales.Contracts.v1.Returns;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Sales.Features.v1.Returns.GetReturnsStats;

public static class GetReturnsStatsEndpoint
{
    internal static RouteHandlerBuilder MapGetReturnsStatsEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/returns/stats",
                (Guid? branchId, IMediator mediator, CancellationToken ct) =>
                    mediator.Send(new GetReturnsStatsQuery(branchId), ct))
            .WithName("GetReturnsStats")
            .WithSummary("Returns stats (counts by status, total return amount)")
            .RequirePermission(SalesPermissions.Returns.View);
    }
}
