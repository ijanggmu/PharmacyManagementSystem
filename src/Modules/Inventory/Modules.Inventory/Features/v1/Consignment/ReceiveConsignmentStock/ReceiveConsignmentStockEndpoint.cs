using FSH.Framework.Shared.Identity.Authorization;
using FSH.Framework.Web.Idempotency;
using FSH.Modules.Inventory.Contracts.Authorization;
using FSH.Modules.Inventory.Contracts.v1.Consignment;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Inventory.Features.v1.Consignment.ReceiveConsignmentStock;

public static class CreateConsignmentReceiptEndpoint
{
    internal static RouteHandlerBuilder MapCreateConsignmentReceiptEndpoint(this IEndpointRouteBuilder endpoints) =>
        endpoints.MapPost("/consignment/receipts",
                async (ReceiveConsignmentStockCommand command, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(command, ct)))
            .WithName("CreateConsignmentReceipt")
            .WithSummary("Receive stock owned by the supplier until sold")
            .RequirePermission(InventoryPermissions.Consignment.Receive)
            .WithIdempotency();
}
