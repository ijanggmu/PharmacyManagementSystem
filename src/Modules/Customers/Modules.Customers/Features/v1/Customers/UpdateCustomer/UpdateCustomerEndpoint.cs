using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Customers.Contracts.Authorization;
using FSH.Modules.Customers.Contracts.v1.Customers;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Customers.Features.v1.Customers.UpdateCustomer;

public static class UpdateCustomerEndpoint
{
    internal static RouteHandlerBuilder MapUpdateCustomerEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapPut("/customers/{customerId:guid}",
                async (Guid customerId, UpdateCustomerCommand body, IMediator mediator, CancellationToken ct) =>
                {
                    ArgumentNullException.ThrowIfNull(body);
                    var command = body with { CustomerId = customerId };
                    return Results.Ok(await mediator.Send(command, ct));
                })
            .WithName("UpdateCustomer")
            .WithSummary("Update a customer")
            .RequirePermission(CustomersPermissions.Customers.Update);
    }
}
