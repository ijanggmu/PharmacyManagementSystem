using FSH.Framework.Shared.Identity.Authorization;
using FSH.Framework.Web.Idempotency;
using FSH.Modules.Sales.Contracts.Authorization;
using FSH.Modules.Sales.Contracts.v1.Ird;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Sales.Features.v1.Ird.SendIrdInvoice;

public static class SendIrdInvoiceEndpoint
{
    internal static RouteHandlerBuilder MapSendIrdInvoiceEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapPost("/{id:guid}/ird/send",
                (Guid id, IMediator mediator, CancellationToken ct) =>
                    mediator.Send(new SendIrdInvoiceCommand(id), ct))
            .WithName("SendIrdInvoice")
            .WithSummary("Enqueue a completed sale's invoice for IRD e-invoice submission")
            .RequirePermission(SalesPermissions.Ird.Send)
            .WithIdempotency();
    }
}
