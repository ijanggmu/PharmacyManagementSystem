using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Customers.Contracts.Authorization;
using FSH.Modules.Customers.Contracts.v1.Customers;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Customers.Features.v1.Customers.DeleteCustomer;

public static class DeleteCustomerEndpoint
{
    internal static RouteHandlerBuilder MapDeleteCustomerEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapDelete("/customers/{customerId:guid}",
                async (Guid customerId, IMediator mediator, CancellationToken ct) =>
                {
                    await mediator.Send(new DeleteCustomerCommand(customerId), ct);
                    return Results.NoContent();
                })
            .WithName("DeleteCustomer")
            .WithSummary("Delete a customer")
            .RequirePermission(CustomersPermissions.Customers.Delete);
    }
}
