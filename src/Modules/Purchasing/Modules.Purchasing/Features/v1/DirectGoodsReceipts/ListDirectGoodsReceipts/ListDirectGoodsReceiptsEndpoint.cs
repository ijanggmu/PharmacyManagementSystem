using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Purchasing.Contracts.Authorization;
using FSH.Modules.Purchasing.Contracts.v1.DirectGoodsReceipts;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Purchasing.Features.v1.DirectGoodsReceipts.ListDirectGoodsReceipts;

public static class ListDirectGoodsReceiptsEndpoint
{
    internal static RouteHandlerBuilder MapListDirectGoodsReceiptsEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/direct-goods-receipts",
                (Guid? branchId, IMediator mediator, CancellationToken ct) =>
                    mediator.Send(new ListDirectGoodsReceiptsQuery(branchId), ct))
            .WithName("ListDirectGoodsReceipts")
            .WithSummary("Direct (non-PO) goods receipts, newest first")
            .RequirePermission(PurchasingPermissions.DirectGoodsReceipts.View);
    }
}
