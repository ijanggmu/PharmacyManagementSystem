using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Sales.Contracts.Authorization;
using FSH.Modules.Sales.Contracts.v1.Ird;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Sales.Features.v1.Ird.GetIrdQueueHealth;

public static class GetIrdQueueHealthEndpoint
{
    internal static RouteHandlerBuilder MapGetIrdQueueHealthEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/reports/ird-health",
                (IMediator mediator, CancellationToken ct) => mediator.Send(new GetIrdQueueHealthQuery(), ct))
            .WithName("GetIrdQueueHealth")
            .WithSummary("IRD invoice queue pending/failed counts and recent failures")
            .RequirePermission(SalesPermissions.Ird.View);
    }
}
