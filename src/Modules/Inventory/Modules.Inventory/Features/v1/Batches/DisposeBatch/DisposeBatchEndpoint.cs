using FSH.Framework.Shared.Identity.Authorization;
using FSH.Framework.Web.Idempotency;
using FSH.Modules.Inventory.Contracts.Authorization;
using FSH.Modules.Inventory.Contracts.v1.Batches;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Inventory.Features.v1.Batches.DisposeBatch;

public static class VoidBatchEndpoint
{
    internal static RouteHandlerBuilder MapVoidBatchEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapPost("/batches/{batchId:guid}/dispose",
                async (Guid batchId, DisposeBatchCommand body, IMediator mediator, CancellationToken ct) =>
                {
                    ArgumentNullException.ThrowIfNull(body);
                    var command = body with { BatchId = batchId };
                    return Results.Ok(await mediator.Send(command, ct));
                })
            .WithName("VoidBatch")
            .WithSummary("Write off a batch's remaining quantity (expired/damaged)")
            .RequirePermission(InventoryPermissions.Batches.Dispose)
            .WithIdempotency();
    }
}
