using FSH.Framework.Shared.Identity.Authorization;
using FSH.Framework.Shared.Persistence;
using FSH.Modules.Auditing.Contracts.Authorization;
using FSH.Modules.Auditing.Contracts.Dtos;
using FSH.Modules.Auditing.Contracts.v1.GetActivityAudits;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Auditing.Features.v1.GetActivityAudits;

public static class GetActivityAuditsEndpoint
{
    public static RouteHandlerBuilder MapGetActivityAuditsEndpoint(this IEndpointRouteBuilder group)
    {
        return group.MapGet(
                "/activity",
                async ([AsParameters] GetActivityAuditsQuery query, IMediator mediator, CancellationToken cancellationToken) =>
                    TypedResults.Ok(await mediator.Send(query, cancellationToken)))
            .WithName("GetActivityAudits")
            .WithSummary("List HTTP requests (system log)")
            .WithDescription("Paged HTTP request log — method, path, status, duration, user, IP — with filters by method, status class, path, user, latency and tenant.")
            .RequirePermission(AuditingPermissions.AuditTrails.View)
            .Produces<PagedResponse<ActivityAuditSummaryDto>>(StatusCodes.Status200OK)
            .Produces(StatusCodes.Status400BadRequest)
            .Produces(StatusCodes.Status401Unauthorized)
            .Produces(StatusCodes.Status403Forbidden);
    }

    public static RouteHandlerBuilder MapGetActivityStatsEndpoint(this IEndpointRouteBuilder group)
    {
        return group.MapGet(
                "/activity/stats",
                async ([AsParameters] GetActivityStatsQuery query, IMediator mediator, CancellationToken cancellationToken) =>
                    TypedResults.Ok(await mediator.Send(query, cancellationToken)))
            .WithName("GetActivityStats")
            .WithSummary("HTTP request KPIs")
            .WithDescription("Request count, 4xx/5xx counts, error rate, average and p95 latency and slow-request count over a window (default 24h).")
            .RequirePermission(AuditingPermissions.AuditTrails.View)
            .Produces<ActivityStatsDto>(StatusCodes.Status200OK)
            .Produces(StatusCodes.Status400BadRequest)
            .Produces(StatusCodes.Status401Unauthorized)
            .Produces(StatusCodes.Status403Forbidden);
    }
}
