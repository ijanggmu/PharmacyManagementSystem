using FSH.Framework.Shared.Identity.Authorization;
using FSH.Framework.Web.Idempotency;
using FSH.Modules.Customers.Contracts.Authorization;
using FSH.Modules.Customers.Contracts.v1.Ledger;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Customers.Features.v1.Ledger.VoidCustomerPayment;

public static class VoidCustomerPaymentEndpoint
{
    internal static RouteHandlerBuilder MapVoidCustomerPaymentEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapPost("/customers/{customerId:guid}/payments/{paymentId:guid}/void",
                async (Guid customerId, Guid paymentId, VoidCustomerPaymentCommand body, IMediator mediator, CancellationToken ct) =>
                {
                    ArgumentNullException.ThrowIfNull(body);
                    // The cheque-register bypass is server-only: a client can never set it.
                    var command = body with { CustomerId = customerId, PaymentId = paymentId, BouncedFromChequeRegister = false };
                    return Results.Ok(await mediator.Send(command, ct));
                })
            .WithName("VoidCustomerPayment")
            .WithSummary("Void a customer payment: reverses the AR ledger entry and the GL voucher")
            .RequirePermission(CustomersPermissions.Ledger.VoidPayment)
            .WithIdempotency();
    }
}
