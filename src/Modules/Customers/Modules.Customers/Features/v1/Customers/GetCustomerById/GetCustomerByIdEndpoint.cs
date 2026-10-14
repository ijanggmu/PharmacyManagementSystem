using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Customers.Contracts.Authorization;
using FSH.Modules.Customers.Contracts.v1.Customers;
using FSH.Modules.Customers.Services;
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
                async (Guid customerId, IMediator mediator, ICustomerFinancialsAccess financials, CancellationToken ct) =>
                    CustomerFinancialsRedaction.Apply(
                        await mediator.Send(new GetCustomerByIdQuery(customerId), ct),
                        await financials.CanViewAsync(ct)))
            .WithName("GetCustomerById")
            .WithSummary("Get a customer by id")
            .RequirePermission(CustomersPermissions.Customers.View);
    }
}
