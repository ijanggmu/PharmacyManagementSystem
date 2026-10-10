using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Sales.Contracts.Authorization;
using FSH.Modules.Sales.Contracts.v1.Refunds;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Sales.Features.v1.Refunds.UpdateRefundStatus;

public static class UpdateRefundStatusEndpoint
{
    internal static RouteHandlerBuilder MapUpdateRefundStatusEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapPut("/refunds/{refundId:guid}",
                async (Guid refundId, UpdateRefundStatusCommand body, IMediator mediator, CancellationToken ct) =>
                {
                    ArgumentNullException.ThrowIfNull(body);
                    var command = body with { RefundId = refundId };
                    return Results.Ok(await mediator.Send(command, ct));
                })
            .WithName("UpdateRefundStatus")
            .WithSummary("Update a refund's status/reason/notes; completing posts the reversing voucher exactly once")
            .RequirePermission(SalesPermissions.Refunds.Update);
    }
}
