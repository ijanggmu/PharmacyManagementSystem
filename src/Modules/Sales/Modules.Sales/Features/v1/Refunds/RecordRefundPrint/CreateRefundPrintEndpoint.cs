using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Sales.Contracts.Authorization;
using FSH.Modules.Sales.Contracts.v1.Refunds;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Sales.Features.v1.Refunds.RecordRefundPrint;

public static class CreateRefundPrintEndpoint
{
    internal static RouteHandlerBuilder MapCreateRefundPrintEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapPost("/refunds/{refundId:guid}/prints",
                async (Guid refundId, RecordRefundPrintCommand body, IMediator mediator, CancellationToken ct) =>
                {
                    ArgumentNullException.ThrowIfNull(body);
                    return Results.Ok(await mediator.Send(body with { RefundId = refundId }, ct));
                })
            .WithName("RecordRefundPrint")
            .WithSummary("Record a credit-note print and get its print number (original vs copy)")
            .RequirePermission(SalesPermissions.Sales.View);
    }
}
