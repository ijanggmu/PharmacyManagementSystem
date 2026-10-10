using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Tickets.Contracts.Authorization;
using FSH.Modules.Tickets.Contracts.Dtos;
using FSH.Modules.Tickets.Contracts.v1.Tickets;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Tickets.Features.v1.Tickets.ListTicketsAcrossTenants;

public static class ListTicketsAcrossTenantsEndpoint
{
    internal static RouteHandlerBuilder MapListTicketsAcrossTenantsEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet(
                "/tickets/all-tenants",
                async (
                    string? tenantId,
                    string? search,
                    TicketStatus? status,
                    TicketPriority? priority,
                    DateTime? fromUtc,
                    DateTime? toUtc,
                    int? pageNumber,
                    int? pageSize,
                    IMediator mediator,
                    CancellationToken ct) =>
                {
                    var query = new ListTicketsAcrossTenantsQuery
                    {
                        TenantId = tenantId,
                        Search = search,
                        Status = status,
                        Priority = priority,
                        FromUtc = fromUtc,
                        ToUtc = toUtc,
                        PageNumber = pageNumber,
                        PageSize = pageSize,
                    };
                    return Results.Ok(await mediator.Send(query, ct));
                })
            .WithName("ListTicketsAcrossTenants")
            .WithSummary("List support tickets across all tenants")
            .WithDescription(
                "SuperAdmin support-desk view: paged, filterable by tenant/keyword/status/priority/created-date " +
                "range. Requires Permissions.Tickets.ViewCrossTenant (root-only).")
            .RequirePermission(TicketsPermissions.Tickets.ViewCrossTenant);
    }
}
