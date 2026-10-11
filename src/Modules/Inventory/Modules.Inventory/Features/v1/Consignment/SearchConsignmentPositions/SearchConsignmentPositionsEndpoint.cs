using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Inventory.Contracts.Authorization;
using FSH.Modules.Inventory.Contracts.v1.Consignment;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Inventory.Features.v1.Consignment.SearchConsignmentPositions;

public static class SearchConsignmentPositionsEndpoint
{
    internal static RouteHandlerBuilder MapSearchConsignmentPositionsEndpoint(this IEndpointRouteBuilder endpoints) =>
        endpoints.MapGet("/consignment/positions",
                async ([AsParameters] SearchConsignmentPositionsQuery query, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(query, ct)))
            .WithName("SearchConsignmentPositions")
            .WithSummary("Search consignment positions — what's held on consignment and what's owed")
            .RequirePermission(InventoryPermissions.Consignment.View);
}
