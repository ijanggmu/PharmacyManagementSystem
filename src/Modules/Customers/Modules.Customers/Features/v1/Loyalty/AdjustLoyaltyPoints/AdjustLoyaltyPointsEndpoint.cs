using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Customers.Contracts.Authorization;
using FSH.Modules.Customers.Contracts.v1.Loyalty;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Customers.Features.v1.Loyalty.AdjustLoyaltyPoints;

public static class AdjustLoyaltyPointsEndpoint
{
    internal static RouteHandlerBuilder MapAdjustLoyaltyPointsEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapPost("/customers/{customerId:guid}/loyalty/adjust",
                async (Guid customerId, AdjustLoyaltyPointsCommand body, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(body with { CustomerId = customerId }, ct)))
            .WithName("AdjustLoyaltyPoints")
            .WithSummary("Add or remove a customer's loyalty points, with a reason")
            .RequirePermission(CustomersPermissions.Loyalty.Adjust);
    }
}
