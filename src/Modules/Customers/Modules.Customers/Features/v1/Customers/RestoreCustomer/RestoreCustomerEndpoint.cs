using FSH.Framework.Shared.Identity.Authorization;
using FSH.Framework.Web.Idempotency;
using FSH.Modules.Customers.Contracts.Authorization;
using FSH.Modules.Customers.Contracts.v1.Customers;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Customers.Features.v1.Customers.RestoreCustomer;

public static class RestoreCustomerEndpoint
{
    internal static RouteHandlerBuilder MapRestoreCustomerEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapPost("/customers/{customerId:guid}/restore",
                async (Guid customerId, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(new RestoreCustomerCommand(customerId), ct)))
            .WithName("RestoreCustomer")
            .WithSummary("Restore a soft-deleted customer")
            .RequirePermission(CustomersPermissions.Customers.Restore)
            .WithIdempotency();
    }
}
