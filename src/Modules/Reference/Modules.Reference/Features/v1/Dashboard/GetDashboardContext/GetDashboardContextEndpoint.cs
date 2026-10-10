using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Reference.Contracts.Authorization;
using FSH.Modules.Reference.Contracts.v1.Dashboard;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Reference.Features.v1.Dashboard.GetDashboardContext;

public static class GetDashboardContextEndpoint
{
    internal static RouteHandlerBuilder MapGetDashboardContextEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/dashboard-context",
                (Guid? branchId, IMediator mediator, CancellationToken ct) =>
                    mediator.Send(new GetDashboardContextQuery(branchId), ct))
            .WithName("GetDashboardContext")
            .WithSummary("Dashboard bootstrap payload for the calling user (user, tenant, notification badge counts)")
            .RequirePermission(ReferencePermissions.Dashboard.View);
    }
}
