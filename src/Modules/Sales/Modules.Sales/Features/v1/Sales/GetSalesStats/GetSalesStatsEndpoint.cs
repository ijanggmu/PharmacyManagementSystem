using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Sales.Contracts.Authorization;
using FSH.Modules.Sales.Contracts.v1.Sales;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Sales.Features.v1.Sales.GetSalesStats;

public static class GetSalesStatsEndpoint
{
    internal static RouteHandlerBuilder MapGetSalesStatsEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/stats",
                (DateTime dateFromUtc, DateTime dateToUtc, Guid? branchId, IMediator mediator, CancellationToken ct) =>
                    mediator.Send(new GetSalesStatsQuery(dateFromUtc, dateToUtc, branchId), ct))
            .WithName("GetSalesStats")
            .WithSummary("Sales stats (count/revenue/discount/average) over a date range")
            .RequirePermission(SalesPermissions.Sales.View);
    }
}
