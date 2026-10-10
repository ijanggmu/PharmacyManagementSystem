using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Customers.Contracts.Authorization;
using FSH.Modules.Customers.Contracts.v1.Customers;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Customers.Features.v1.Customers.GetCustomerById;

public static class GetCustomerByIdEndpoint
{
    internal static RouteHandlerBuilder MapGetCustomerByIdEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/customers/{customerId:guid}",
                (Guid customerId, IMediator mediator, CancellationToken ct) =>
                    mediator.Send(new GetCustomerByIdQuery(customerId), ct))
            .WithName("GetCustomerById")
            .WithSummary("Get a customer by id")
            .RequirePermission(CustomersPermissions.Customers.View);
    }
}
