using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Sales.Contracts.Authorization;
using FSH.Modules.Sales.Contracts.v1.Sales;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Sales.Features.v1.Sales.GetReversalPreview;

public static class GetReversalSettlementPreviewEndpoint
{
    internal static RouteHandlerBuilder MapGetReversalSettlementPreviewEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/{saleId:guid}/reversal-preview",
                (Guid saleId, decimal amount, string? refundMethod, IMediator mediator, CancellationToken ct) =>
                    mediator.Send(new GetReversalSettlementPreviewQuery(saleId, amount, refundMethod), ct))
            .WithName("GetReversalSettlementPreview")
            .WithSummary("Preview how a return/refund of the sale would be settled (cash / bank / customer account)")
            .RequirePermission(SalesPermissions.Sales.View);
    }
}
