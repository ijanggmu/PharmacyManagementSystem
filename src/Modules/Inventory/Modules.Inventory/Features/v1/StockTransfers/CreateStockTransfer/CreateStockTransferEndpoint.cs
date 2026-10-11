using FSH.Framework.Shared.Identity.Authorization;
using FSH.Framework.Web.Idempotency;
using FSH.Modules.Inventory.Contracts.Authorization;
using FSH.Modules.Inventory.Contracts.v1.StockTransfers;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Inventory.Features.v1.StockTransfers.CreateStockTransfer;

public static class CreateStockTransferEndpoint
{
    internal static RouteHandlerBuilder MapCreateStockTransferEndpoint(this IEndpointRouteBuilder endpoints) =>
        endpoints.MapPost("/stock-transfers",
                async (CreateStockTransferCommand command, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(command, ct)))
            .WithName("CreateStockTransfer")
            .WithSummary("Dispatch a stock transfer between two locations (debits the source only)")
            .RequirePermission(InventoryPermissions.StockTransfers.Create)
            .WithIdempotency();
}
