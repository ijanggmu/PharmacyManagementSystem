using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Purchasing.Contracts.Authorization;
using FSH.Modules.Purchasing.Contracts.v1.DirectGoodsReceipts;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Purchasing.Features.v1.DirectGoodsReceipts.GetDirectGoodsReceiptById;

public static class GetDirectGoodsReceiptByIdEndpoint
{
    internal static RouteHandlerBuilder MapGetDirectGoodsReceiptByIdEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/direct-goods-receipts/{receiptId:guid}",
                (Guid receiptId, IMediator mediator, CancellationToken ct) =>
                    mediator.Send(new GetDirectGoodsReceiptByIdQuery(receiptId), ct))
            .WithName("GetDirectGoodsReceiptById")
            .WithSummary("Get a direct (non-PO) goods receipt, with lines, by id")
            .RequirePermission(PurchasingPermissions.DirectGoodsReceipts.View);
    }
}
