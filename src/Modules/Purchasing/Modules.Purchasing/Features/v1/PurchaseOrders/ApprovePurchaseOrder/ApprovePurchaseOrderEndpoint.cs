using FSH.Framework.Shared.Identity.Authorization;
using FSH.Framework.Web.Idempotency;
using FSH.Modules.Purchasing.Contracts.Authorization;
using FSH.Modules.Purchasing.Contracts.v1.PurchaseOrders;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Purchasing.Features.v1.PurchaseOrders.ApprovePurchaseOrder;

public static class ApprovePurchaseOrderEndpoint
{
    internal static RouteHandlerBuilder MapApprovePurchaseOrderEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapPost("/purchase-orders/{purchaseOrderId:guid}/approve",
                async (Guid purchaseOrderId, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(new ApprovePurchaseOrderCommand(purchaseOrderId), ct)))
            .WithName("ApprovePurchaseOrder")
            .WithSummary("Approve a draft purchase order")
            .RequirePermission(PurchasingPermissions.PurchaseOrders.Approve)
            .WithIdempotency();
    }
}
