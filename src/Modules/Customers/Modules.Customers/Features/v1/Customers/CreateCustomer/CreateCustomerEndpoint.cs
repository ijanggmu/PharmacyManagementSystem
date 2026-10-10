using FSH.Framework.Shared.Identity.Authorization;
using FSH.Framework.Web.Idempotency;
using FSH.Modules.Customers.Contracts.Authorization;
using FSH.Modules.Customers.Contracts.v1.Customers;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Customers.Features.v1.Customers.CreateCustomer;

public static class CreateCustomerEndpoint
{
    internal static RouteHandlerBuilder MapCreateCustomerEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapPost("/customers",
                async (CreateCustomerCommand command, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(command, ct)))
            .WithName("CreateCustomer")
            .WithSummary("Create a customer")
            .RequirePermission(CustomersPermissions.Customers.Create)
            .WithIdempotency();
    }
}
