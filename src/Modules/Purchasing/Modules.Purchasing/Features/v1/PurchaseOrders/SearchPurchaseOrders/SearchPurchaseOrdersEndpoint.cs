using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Purchasing.Contracts.Authorization;
using FSH.Modules.Purchasing.Contracts.v1.PurchaseOrders;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Purchasing.Features.v1.PurchaseOrders.SearchPurchaseOrders;

public static class SearchPurchaseOrdersEndpoint
{
    internal static RouteHandlerBuilder MapSearchPurchaseOrdersEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/purchase-orders",
                (Guid? supplierId, string? status, DateTime? dateFromUtc, DateTime? dateToUtc,
                 int? pageNumber, int? pageSize, string? search, Guid? branchId, IMediator mediator, CancellationToken ct) =>
                    mediator.Send(
                        new SearchPurchaseOrdersQuery(
                            supplierId, status, dateFromUtc, dateToUtc,
                            pageNumber is null or 0 ? 1 : pageNumber.Value,
                            pageSize is null or 0 ? 50 : pageSize.Value,
                            search,
                            branchId),
                        ct))
            .WithName("SearchPurchaseOrders")
            .WithSummary("Search purchase orders (paged; supplier, status list, date range and free-text search)")
            .RequirePermission(PurchasingPermissions.PurchaseOrders.View);
    }
}
