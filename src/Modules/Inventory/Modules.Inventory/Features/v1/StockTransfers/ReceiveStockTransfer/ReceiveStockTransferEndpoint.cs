using FSH.Framework.Shared.Identity.Authorization;
using FSH.Framework.Web.Idempotency;
using FSH.Modules.Inventory.Contracts.Authorization;
using FSH.Modules.Inventory.Contracts.v1.StockTransfers;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Inventory.Features.v1.StockTransfers.ReceiveStockTransfer;

public static class ReceiveStockTransferEndpoint
{
    internal static RouteHandlerBuilder MapReceiveStockTransferEndpoint(this IEndpointRouteBuilder endpoints) =>
        endpoints.MapPost("/stock-transfers/{stockTransferId:guid}/receive",
                async (Guid stockTransferId, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(new ReceiveStockTransferCommand(stockTransferId), ct)))
            .WithName("ReceiveStockTransfer")
            .WithSummary("Receive an in-transit stock transfer — credits the destination location")
            .RequirePermission(InventoryPermissions.StockTransfers.Receive)
            .WithIdempotency();
}
