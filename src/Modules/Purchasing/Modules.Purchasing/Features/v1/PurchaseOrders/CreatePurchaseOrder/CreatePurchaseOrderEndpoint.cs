using FSH.Framework.Shared.Identity.Authorization;
using FSH.Framework.Web.Idempotency;
using FSH.Modules.Purchasing.Contracts.Authorization;
using FSH.Modules.Purchasing.Contracts.v1.PurchaseOrders;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Purchasing.Features.v1.PurchaseOrders.CreatePurchaseOrder;

public static class CreatePurchaseOrderEndpoint
{
    internal static RouteHandlerBuilder MapCreatePurchaseOrderEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapPost("/purchase-orders",
                async (CreatePurchaseOrderCommand command, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(command, ct)))
            .WithName("CreatePurchaseOrder")
            .WithSummary("Create a draft purchase order")
            .RequirePermission(PurchasingPermissions.PurchaseOrders.Create)
            .WithIdempotency();
    }
}
