using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Inventory.Contracts.Authorization;
using FSH.Modules.Inventory.Contracts.v1.Batches;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Inventory.Features.v1.Batches.GetBatchById;

public static class GetBatchByIdEndpoint
{
    internal static RouteHandlerBuilder MapGetBatchByIdEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/batches/{batchId:guid}",
                (Guid batchId, IMediator mediator, CancellationToken ct) =>
                    mediator.Send(new GetBatchByIdQuery(batchId), ct))
            .WithName("GetBatchById")
            .WithSummary("Get a medicine batch by id")
            .RequirePermission(InventoryPermissions.Batches.View);
    }
}
