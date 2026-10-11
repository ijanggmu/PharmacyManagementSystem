using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Inventory.Contracts.Authorization;
using FSH.Modules.Inventory.Contracts.v1.StockTransfers;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Inventory.Features.v1.StockTransfers.SearchStockTransfers;

public static class SearchStockTransfersEndpoint
{
    internal static RouteHandlerBuilder MapSearchStockTransfersEndpoint(this IEndpointRouteBuilder endpoints) =>
        endpoints.MapGet("/stock-transfers",
                async ([AsParameters] SearchStockTransfersQuery query, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(query, ct)))
            .WithName("SearchStockTransfers")
            .WithSummary("List stock transfers, optionally filtered by location or status")
            .RequirePermission(InventoryPermissions.StockTransfers.View);
}
