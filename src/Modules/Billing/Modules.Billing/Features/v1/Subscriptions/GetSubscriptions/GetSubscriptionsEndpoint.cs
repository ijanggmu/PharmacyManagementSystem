using FSH.Modules.Billing.Contracts.Authorization;
using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Billing.Contracts.v1.Subscriptions;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Billing.Features.v1.Subscriptions.GetSubscriptions;

public static class GetSubscriptionsEndpoint
{
    internal static RouteHandlerBuilder MapGetSubscriptionsEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/subscriptions/all",
                (IMediator mediator, CancellationToken ct) =>
                    mediator.Send(new GetSubscriptionsQuery(), ct))
            .WithName("GetSubscriptions")
            .WithSummary("List the current subscription for every tenant (root only)")
            .RequirePermission(BillingPermissions.View);
    }
}
