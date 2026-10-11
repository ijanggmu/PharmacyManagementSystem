using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Sales.Contracts.Authorization;
using FSH.Modules.Sales.Contracts.v1.Refunds;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Sales.Features.v1.Refunds.GetRefundById;

public static class GetRefundByIdEndpoint
{
    internal static RouteHandlerBuilder MapGetRefundByIdEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/refunds/{refundId:guid}",
                (Guid refundId, IMediator mediator, CancellationToken ct) =>
                    mediator.Send(new GetRefundByIdQuery(refundId), ct))
            .WithName("GetRefundById")
            .WithSummary("Get a refund (with items) by id")
            .RequirePermission(SalesPermissions.Refunds.View);
    }
}
