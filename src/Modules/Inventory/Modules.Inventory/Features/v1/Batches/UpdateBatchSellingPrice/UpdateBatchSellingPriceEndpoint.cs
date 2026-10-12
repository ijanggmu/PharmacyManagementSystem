using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Inventory.Contracts.Authorization;
using FSH.Modules.Inventory.Contracts.v1.Batches;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Inventory.Features.v1.Batches.UpdateBatchSellingPrice;

public static class UpdateBatchSellingPriceEndpoint
{
    internal static RouteHandlerBuilder MapUpdateBatchSellingPriceEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapPut("/batches/{batchId:guid}/selling-price",
                async (Guid batchId, UpdateBatchSellingPriceCommand body, IMediator mediator, CancellationToken ct) =>
                {
                    ArgumentNullException.ThrowIfNull(body);
                    var command = body with { BatchId = batchId };
                    return Results.Ok(await mediator.Send(command, ct));
                })
            .WithName("UpdateBatchSellingPrice")
            .WithSummary("Give one batch its own selling price (e.g. a different MRP on that lot)")
            .RequirePermission(InventoryPermissions.Medicines.Update);
    }
}
