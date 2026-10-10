using FSH.Framework.Shared.Identity.Authorization;
using FSH.Framework.Web.Idempotency;
using FSH.Modules.Purchasing.Contracts.Authorization;
using FSH.Modules.Purchasing.Contracts.v1.PurchaseOrders;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Purchasing.Features.v1.PurchaseOrders.ReceivePurchaseOrder;

public static class CapturePurchaseOrderReceiptEndpoint
{
    internal static RouteHandlerBuilder MapCapturePurchaseOrderReceiptEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapPost("/purchase-orders/{purchaseOrderId:guid}/receive",
                async (Guid purchaseOrderId, ReceivePurchaseOrderRequest? body, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(
                        new ReceivePurchaseOrderCommand(
                            purchaseOrderId, body?.Lines, body?.ReceiptDateUtc, body?.CreateBackorder ?? true), ct)))
            .WithName("CapturePurchaseOrderReceipt")
            .WithSummary("Receive a purchase order (full or short delivery): captures batch details, adds stock, posts the AP voucher, updates the supplier ledger; a short delivery can raise a draft backorder")
            .RequirePermission(PurchasingPermissions.PurchaseOrders.Receive)
            .WithIdempotency();
    }
}
