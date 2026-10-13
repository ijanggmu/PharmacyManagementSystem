using FSH.Framework.Shared.Identity.Authorization;
using FSH.Framework.Web.Idempotency;
using FSH.Modules.Suppliers.Contracts.Authorization;
using FSH.Modules.Suppliers.Contracts.v1.Ledger;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Suppliers.Features.v1.Ledger.VoidSupplierPayment;

public static class VoidSupplierPaymentEndpoint
{
    internal static RouteHandlerBuilder MapVoidSupplierPaymentEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapPost("/suppliers/{supplierId:guid}/payments/{paymentId:guid}/void",
                async (Guid supplierId, Guid paymentId, VoidSupplierPaymentCommand body, IMediator mediator, CancellationToken ct) =>
                {
                    ArgumentNullException.ThrowIfNull(body);
                    var command = body with { SupplierId = supplierId, PaymentId = paymentId };
                    return Results.Ok(await mediator.Send(command, ct));
                })
            .WithName("VoidSupplierPayment")
            .WithSummary("Void a supplier payment: reverses the AP ledger entry and the GL voucher, and reopens the bill it paid")
            .RequirePermission(SuppliersPermissions.Ledger.VoidPayment)
            .WithIdempotency();
    }
}
