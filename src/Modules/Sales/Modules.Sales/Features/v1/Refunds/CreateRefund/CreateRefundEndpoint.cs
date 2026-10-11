using FSH.Framework.Shared.Identity.Authorization;
using FSH.Framework.Web.Idempotency;
using FSH.Modules.Sales.Contracts.Authorization;
using FSH.Modules.Sales.Contracts.v1.Refunds;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Sales.Features.v1.Refunds.CreateRefund;

public static class CreateRefundEndpoint
{
    internal static RouteHandlerBuilder MapCreateRefundEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapPost("/refunds",
                async (CreateRefundCommand command, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(command, ct)))
            .WithName("CreateRefund")
            .WithSummary("Create a monetary refund against a sale: caps against remaining refundable balance, posts the reversing voucher if created completed")
            .RequirePermission(SalesPermissions.Refunds.Create)
            .WithIdempotency();
    }
}
