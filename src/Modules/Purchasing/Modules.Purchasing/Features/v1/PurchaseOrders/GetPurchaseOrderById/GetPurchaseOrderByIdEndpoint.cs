using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Purchasing.Contracts.Authorization;
using FSH.Modules.Purchasing.Contracts.v1.PurchaseOrders;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Purchasing.Features.v1.PurchaseOrders.GetPurchaseOrderById;

public static class GetPurchaseOrderByIdEndpoint
{
    internal static RouteHandlerBuilder MapGetPurchaseOrderByIdEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/purchase-orders/{purchaseOrderId:guid}",
                (Guid purchaseOrderId, IMediator mediator, CancellationToken ct) =>
                    mediator.Send(new GetPurchaseOrderByIdQuery(purchaseOrderId), ct))
            .WithName("GetPurchaseOrderById")
            .WithSummary("Get a purchase order (with lines) by id")
            .RequirePermission(PurchasingPermissions.PurchaseOrders.View);
    }
}
