using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Sales.Contracts.Authorization;
using FSH.Modules.Sales.Contracts.v1.Sales;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Sales.Features.v1.Sales.GetSalesSummary;

public static class GetSalesSummaryEndpoint
{
    internal static RouteHandlerBuilder MapGetSalesSummaryEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/summary",
                (DateTime? todayStartUtc, IMediator mediator, CancellationToken ct) =>
                    mediator.Send(new GetSalesSummaryQuery(todayStartUtc), ct))
            .WithName("GetSalesSummary")
            .WithSummary("Legacy-shaped sales summary for the current branch (totals, today, payment state counts)")
            .RequirePermission(SalesPermissions.Sales.View);
    }
}
