using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Tickets.Contracts.Authorization;
using FSH.Modules.Tickets.Contracts.v1.Tickets;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Tickets.Features.v1.Tickets.GetTicketAcrossTenants;

public static class GetTicketAcrossTenantsEndpoints
{
    internal static RouteHandlerBuilder MapGetTicketByIdAcrossTenantsEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/tickets/all-tenants/{ticketId:guid}",
                async (Guid ticketId, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(new GetTicketByIdAcrossTenantsQuery(ticketId), ct)))
            .WithName("GetTicketByIdAcrossTenants")
            .WithSummary("Get any tenant's ticket by id")
            .WithDescription("SuperAdmin support-desk detail. Requires Permissions.Tickets.ViewCrossTenant (root-only).")
            .RequirePermission(TicketsPermissions.Tickets.ViewCrossTenant);
    }

    internal static RouteHandlerBuilder MapListTicketCommentsAcrossTenantsEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/tickets/all-tenants/{ticketId:guid}/comments",
                async (Guid ticketId, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(new ListTicketCommentsAcrossTenantsQuery(ticketId), ct)))
            .WithName("ListTicketCommentsAcrossTenants")
            .WithSummary("List any tenant's ticket comments")
            .WithDescription("SuperAdmin support-desk detail. Requires Permissions.Tickets.ViewCrossTenant (root-only).")
            .RequirePermission(TicketsPermissions.Tickets.ViewCrossTenant);
    }
}
