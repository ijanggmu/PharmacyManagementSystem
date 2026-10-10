using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Inventory.Contracts.Authorization;
using FSH.Modules.Inventory.Contracts.v1.Consignment;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Inventory.Features.v1.Consignment.ListConsignmentSettlements;

public static class ListConsignmentSettlementsEndpoint
{
    internal static RouteHandlerBuilder MapListConsignmentSettlementsEndpoint(this IEndpointRouteBuilder endpoints) =>
        endpoints.MapGet("/consignment/settlements",
                async ([AsParameters] ListConsignmentSettlementsQuery query, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(query, ct)))
            .WithName("ListConsignmentSettlements")
            .WithSummary("Settlement history for consigned stock, newest first, optionally for one supplier (paged)")
            .RequirePermission(InventoryPermissions.Consignment.View);
}
