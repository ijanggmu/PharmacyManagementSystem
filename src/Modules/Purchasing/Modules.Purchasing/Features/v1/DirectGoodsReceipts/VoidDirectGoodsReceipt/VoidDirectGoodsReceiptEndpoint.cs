using FSH.Framework.Shared.Identity.Authorization;
using FSH.Framework.Web.Idempotency;
using FSH.Modules.Purchasing.Contracts.Authorization;
using FSH.Modules.Purchasing.Contracts.v1.DirectGoodsReceipts;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Purchasing.Features.v1.DirectGoodsReceipts.VoidDirectGoodsReceipt;

public static class VoidDirectGoodsReceiptEndpoint
{
    internal static RouteHandlerBuilder MapVoidDirectGoodsReceiptEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapPost("/direct-goods-receipts/{receiptId:guid}/void",
                async (Guid receiptId, VoidDirectGoodsReceiptCommand body, IMediator mediator, CancellationToken ct) =>
                {
                    ArgumentNullException.ThrowIfNull(body);
                    var command = body with { ReceiptId = receiptId };
                    return Results.Ok(await mediator.Send(command, ct));
                })
            .WithName("VoidDirectGoodsReceipt")
            .WithSummary("Void a direct goods receipt: reverses stock, the AP ledger, and the GL voucher")
            .RequirePermission(PurchasingPermissions.DirectGoodsReceipts.Void)
            .WithIdempotency();
    }
}
