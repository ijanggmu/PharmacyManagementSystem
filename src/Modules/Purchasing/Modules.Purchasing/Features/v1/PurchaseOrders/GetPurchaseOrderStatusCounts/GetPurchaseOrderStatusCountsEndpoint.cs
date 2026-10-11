using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Purchasing.Contracts.Authorization;
using FSH.Modules.Purchasing.Contracts.v1.PurchaseOrders;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Purchasing.Features.v1.PurchaseOrders.GetPurchaseOrderStatusCounts;

public static class GetPurchaseOrderStatusCountsEndpoint
{
    internal static RouteHandlerBuilder MapGetPurchaseOrderStatusCountsEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/purchase-orders/status-counts",
                (Guid? branchId, IMediator mediator, CancellationToken ct) =>
                    mediator.Send(new GetPurchaseOrderStatusCountsQuery(branchId), ct))
            .WithName("GetPurchaseOrderStatusCounts")
            .WithSummary("Number of purchase orders per status")
            .RequirePermission(PurchasingPermissions.PurchaseOrders.View);
    }
}
