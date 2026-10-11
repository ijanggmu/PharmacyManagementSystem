using FSH.Modules.Auditing.Contracts.Authorization;
using FSH.Framework.Shared.Identity.Authorization;
using FSH.Framework.Shared.Persistence;
using FSH.Modules.Auditing.Contracts.Dtos;
using FSH.Modules.Auditing.Contracts.v1.GetIntegrationEvents;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Auditing.Features.v1.GetIntegrationEvents;

public static class GetIntegrationEventsEndpoint
{
    public static RouteHandlerBuilder MapGetIntegrationEventsEndpoint(this IEndpointRouteBuilder group)
    {
        return group.MapGet(
                "/integration-events",
                async ([AsParameters] GetIntegrationEventsQuery query, IMediator mediator, CancellationToken cancellationToken) =>
                    TypedResults.Ok(await mediator.Send(query, cancellationToken)))
            .WithName("GetIntegrationEvents")
            .WithSummary("List integration (outbox) event dispatch status")
            .WithDescription("Retrieve cross-module integration events from the transactional outbox, with pending/processed/failed/dead status, for the admin Integration Log view.")
            .RequirePermission(AuditingPermissions.AuditTrails.View)
            .Produces<PagedResponse<IntegrationEventLogDto>>(StatusCodes.Status200OK)
            .Produces(StatusCodes.Status401Unauthorized)
            .Produces(StatusCodes.Status403Forbidden);
    }

    public static RouteHandlerBuilder MapGetIntegrationEventByIdEndpoint(this IEndpointRouteBuilder group)
    {
        return group.MapGet(
                "/integration-events/{id:guid}",
                async (Guid id, IMediator mediator, CancellationToken cancellationToken) =>
                    TypedResults.Ok(await mediator.Send(new GetIntegrationEventByIdQuery(id), cancellationToken)))
            .WithName("GetIntegrationEventById")
            .WithSummary("Get one integration (outbox) event")
            .WithDescription("Dispatch state, masked JSON payload and the inbox handlers that consumed the event.")
            .RequirePermission(AuditingPermissions.AuditTrails.View)
            .Produces<IntegrationEventDetailDto>(StatusCodes.Status200OK)
            .Produces(StatusCodes.Status401Unauthorized)
            .Produces(StatusCodes.Status403Forbidden)
            .Produces(StatusCodes.Status404NotFound);
    }

}
