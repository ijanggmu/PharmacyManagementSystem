using FSH.Framework.Shared.Identity.Authorization;
using FSH.Framework.Shared.Persistence;
using FSH.Modules.Auditing.Contracts.Authorization;
using FSH.Modules.Auditing.Contracts.Dtos;
using FSH.Modules.Auditing.Contracts.v1.SearchSecurityAudits;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Auditing.Features.v1.SearchSecurityAudits;

public static class SearchSecurityAuditsEndpoint
{
    public static RouteHandlerBuilder MapSearchSecurityAuditsEndpoint(this IEndpointRouteBuilder group)
    {
        return group.MapGet(
                "/security/search",
                async ([AsParameters] SearchSecurityAuditsQuery query, IMediator mediator, CancellationToken cancellationToken) =>
                    TypedResults.Ok(await mediator.Send(query, cancellationToken)))
            .WithName("SearchSecurityAudits")
            .WithSummary("Search security audit events (paged)")
            .WithDescription("Paged, tenant-scoped security events (all SecurityAction values) with action / severity / user / free-text filters and a total count.")
            .RequirePermission(AuditingPermissions.AuditTrails.View)
            .Produces<PagedResponse<SecurityAuditSummaryDto>>(StatusCodes.Status200OK)
            .Produces(StatusCodes.Status400BadRequest)
            .Produces(StatusCodes.Status401Unauthorized)
            .Produces(StatusCodes.Status403Forbidden);
    }

    public static RouteHandlerBuilder MapSearchExceptionAuditsEndpoint(this IEndpointRouteBuilder group)
    {
        return group.MapGet(
                "/exceptions/search",
                async ([AsParameters] SearchExceptionAuditsQuery query, IMediator mediator, CancellationToken cancellationToken) =>
                    TypedResults.Ok(await mediator.Send(query, cancellationToken)))
            .WithName("SearchExceptionAudits")
            .WithSummary("Search exception audit events (paged)")
            .WithDescription("Paged, tenant-scoped exceptions with type, message and route extracted from the payload, plus a total count.")
            .RequirePermission(AuditingPermissions.AuditTrails.View)
            .Produces<PagedResponse<ExceptionAuditSummaryDto>>(StatusCodes.Status200OK)
            .Produces(StatusCodes.Status400BadRequest)
            .Produces(StatusCodes.Status401Unauthorized)
            .Produces(StatusCodes.Status403Forbidden);
    }
}
