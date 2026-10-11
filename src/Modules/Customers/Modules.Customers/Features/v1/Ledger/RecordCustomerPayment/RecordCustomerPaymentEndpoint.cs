using FSH.Framework.Shared.Identity.Authorization;
using FSH.Framework.Web.Idempotency;
using FSH.Modules.Customers.Contracts.Authorization;
using FSH.Modules.Customers.Contracts.v1.Ledger;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Customers.Features.v1.Ledger.RecordCustomerPayment;

public static class CreateCustomerPaymentEndpoint
{
    internal static RouteHandlerBuilder MapCreateCustomerPaymentEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapPost("/customers/{customerId:guid}/payments",
                async (Guid customerId, RecordCustomerPaymentCommand body, IMediator mediator, CancellationToken ct) =>
                {
                    ArgumentNullException.ThrowIfNull(body);
                    var command = body with { CustomerId = customerId };
                    return Results.Ok(await mediator.Send(command, ct));
                })
            .WithName("CreateCustomerPayment")
            .WithSummary("Record a payment received from a customer")
            .RequirePermission(CustomersPermissions.Ledger.RecordPayment)
            .WithIdempotency();
    }
}
