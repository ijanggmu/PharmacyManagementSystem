using FSH.Framework.Shared.Identity.Authorization;
using FSH.Framework.Web.Idempotency;
using FSH.Modules.Inventory.Contracts.Authorization;
using FSH.Modules.Inventory.Contracts.v1.StockTransfers;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Inventory.Features.v1.StockTransfers.CancelStockTransfer;

public static class CancelStockTransferEndpoint
{
    internal static RouteHandlerBuilder MapCancelStockTransferEndpoint(this IEndpointRouteBuilder endpoints) =>
        endpoints.MapPost("/stock-transfers/{stockTransferId:guid}/cancel",
                async (Guid stockTransferId, CancelStockTransferCommand body, IMediator mediator, CancellationToken ct) =>
                {
                    ArgumentNullException.ThrowIfNull(body);
                    var command = body with { StockTransferId = stockTransferId };
                    return Results.Ok(await mediator.Send(command, ct));
                })
            .WithName("CancelStockTransfer")
            .WithSummary("Cancel an in-transit stock transfer — credits the source location back")
            .RequirePermission(InventoryPermissions.StockTransfers.Cancel)
            .WithIdempotency();
}
