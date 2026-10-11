using FSH.Framework.Shared.Identity.Authorization;
using FSH.Framework.Web.Idempotency;
using FSH.Modules.Purchasing.Contracts.Authorization;
using FSH.Modules.Purchasing.Contracts.v1.PurchaseOrders;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Purchasing.Features.v1.PurchaseOrders.CancelPurchaseOrder;

public static class VoidPurchaseOrderEndpoint
{
    internal static RouteHandlerBuilder MapVoidPurchaseOrderEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapPost("/purchase-orders/{purchaseOrderId:guid}/cancel",
                async (Guid purchaseOrderId, CancelPurchaseOrderCommand body, IMediator mediator, CancellationToken ct) =>
                {
                    ArgumentNullException.ThrowIfNull(body);
                    var command = body with { PurchaseOrderId = purchaseOrderId };
                    return Results.Ok(await mediator.Send(command, ct));
                })
            .WithName("VoidPurchaseOrder")
            .WithSummary("Cancel a draft or approved purchase order")
            .RequirePermission(PurchasingPermissions.PurchaseOrders.Cancel)
            .WithIdempotency();
    }
}
