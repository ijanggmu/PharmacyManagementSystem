using FSH.Framework.Shared.Identity.Authorization;
using FSH.Framework.Web.Idempotency;
using FSH.Modules.Purchasing.Contracts.Authorization;
using FSH.Modules.Purchasing.Contracts.v1.DirectGoodsReceipts;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Purchasing.Features.v1.DirectGoodsReceipts.CreateDirectGoodsReceipt;

public static class CreateDirectGoodsReceiptEndpoint
{
    internal static RouteHandlerBuilder MapCreateDirectGoodsReceiptEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapPost("/direct-goods-receipts",
                (CreateDirectGoodsReceiptCommand command, IMediator mediator, CancellationToken ct) =>
                    mediator.Send(command, ct))
            .WithName("CreateDirectGoodsReceipt")
            .WithSummary("Receive stock directly from a supplier, without a purchase order")
            .RequirePermission(PurchasingPermissions.DirectGoodsReceipts.Create)
            .WithIdempotency();
    }
}
