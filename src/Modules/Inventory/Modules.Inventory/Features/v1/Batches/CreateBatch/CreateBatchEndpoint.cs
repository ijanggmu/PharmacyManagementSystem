using FSH.Framework.Shared.Identity.Authorization;
using FSH.Framework.Web.Idempotency;
using FSH.Modules.Inventory.Contracts.Authorization;
using FSH.Modules.Inventory.Contracts.v1.Batches;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Inventory.Features.v1.Batches.CreateBatch;

public static class CreateBatchEndpoint
{
    internal static RouteHandlerBuilder MapCreateBatchEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapPost("/batches",
                async (CreateBatchCommand command, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(command, ct)))
            .WithName("CreateBatch")
            .WithSummary("Create a medicine batch (manual/opening stock entry)")
            .RequirePermission(InventoryPermissions.Batches.Create)
            .WithIdempotency();
    }
}
