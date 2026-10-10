using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Sales.Contracts.Authorization;
using FSH.Modules.Sales.Contracts.v1.Refunds;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Sales.Features.v1.Refunds.DeleteRefund;

public static class DeleteRefundEndpoint
{
    internal static RouteHandlerBuilder MapDeleteRefundEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapDelete("/refunds/{refundId:guid}",
                async (Guid refundId, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(new DeleteRefundCommand(refundId), ct)))
            .WithName("DeleteRefund")
            .WithSummary("Soft-delete an unposted refund (409 once it is posted to accounting)")
            .RequirePermission(SalesPermissions.Refunds.Update);
    }
}
