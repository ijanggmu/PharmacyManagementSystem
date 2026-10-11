using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Customers.Contracts.Authorization;
using FSH.Modules.Customers.Contracts.v1.Customers;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Customers.Features.v1.Customers.GetCustomerByCode;

public static class GetCustomerByCodeEndpoint
{
    internal static RouteHandlerBuilder MapGetCustomerByCodeEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/customers/by-code/{code}",
                (string code, IMediator mediator, CancellationToken ct) =>
                    mediator.Send(new GetCustomerByCodeQuery(code), ct))
            .WithName("GetCustomerByCode")
            .WithSummary("Find a customer by the number on their card (typed or scanned from its QR)")
            .RequirePermission(CustomersPermissions.Customers.View);
    }
}
