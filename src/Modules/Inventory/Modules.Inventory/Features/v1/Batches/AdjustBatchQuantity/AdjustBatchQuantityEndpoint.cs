using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Inventory.Contracts.Authorization;
using FSH.Modules.Inventory.Contracts.v1.Batches;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Inventory.Features.v1.Batches.AdjustBatchQuantity;

public static class AdjustBatchQuantityEndpoint
{
    internal static RouteHandlerBuilder MapAdjustBatchQuantityEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapPost("/batches/{batchId:guid}/adjust",
                async (Guid batchId, AdjustBatchQuantityCommand body, IMediator mediator, CancellationToken ct) =>
                {
                    ArgumentNullException.ThrowIfNull(body);
                    var command = body with { BatchId = batchId };
                    return Results.Ok(await mediator.Send(command, ct));
                })
            .WithName("AdjustBatchQuantity")
            .WithSummary("Set a batch to an audited absolute quantity (e.g. after a stock count)")
            .RequirePermission(InventoryPermissions.Batches.AdjustStock);
    }
}
