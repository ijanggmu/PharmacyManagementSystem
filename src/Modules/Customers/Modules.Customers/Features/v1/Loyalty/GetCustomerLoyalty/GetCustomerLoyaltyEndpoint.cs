using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Customers.Contracts.Authorization;
using FSH.Modules.Customers.Contracts.v1.Loyalty;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Customers.Features.v1.Loyalty.GetCustomerLoyalty;

public static class GetCustomerLoyaltyEndpoint
{
    internal static RouteHandlerBuilder MapGetCustomerLoyaltyEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/customers/{customerId:guid}/loyalty",
                (Guid customerId, int? take, IMediator mediator, CancellationToken ct) =>
                    mediator.Send(new GetCustomerLoyaltyQuery(customerId, take ?? 50), ct))
            .WithName("GetCustomerLoyalty")
            .WithSummary("A customer's loyalty membership, points and recent point movements")
            .RequirePermission(CustomersPermissions.Customers.View);
    }
}
