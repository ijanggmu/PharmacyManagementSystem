using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Onboarding.Contracts.Authorization;
using FSH.Modules.Onboarding.Contracts.v1.Onboarding;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Onboarding.Features.v1.Onboarding.GetOnboardingStatus;

public static class GetOnboardingStatusEndpoint
{
    internal static RouteHandlerBuilder MapGetOnboardingStatusEndpoint(this IEndpointRouteBuilder endpoints) =>
        endpoints.MapGet("/onboarding/status",
                async (IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(new GetOnboardingStatusQuery(), ct)))
            .WithName("GetOnboardingStatus")
            .WithSummary("Get the tenant's onboarding (opening-balance) status")
            .RequirePermission(OnboardingPermissions.Onboarding.View);
}
