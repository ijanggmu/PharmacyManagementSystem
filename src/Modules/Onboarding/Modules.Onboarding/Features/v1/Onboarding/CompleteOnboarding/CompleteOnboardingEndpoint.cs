using FSH.Framework.Shared.Identity.Authorization;
using FSH.Framework.Web.Idempotency;
using FSH.Modules.Onboarding.Contracts.Authorization;
using FSH.Modules.Onboarding.Contracts.v1.Onboarding;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Onboarding.Features.v1.Onboarding.CompleteOnboarding;

public static class FinalizeOnboardingEndpoint
{
    internal static RouteHandlerBuilder MapFinalizeOnboardingEndpoint(this IEndpointRouteBuilder endpoints) =>
        endpoints.MapPost("/onboarding/complete",
                async (CompleteOnboardingCommand command, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(command, ct)))
            .WithName("FinalizeOnboarding")
            .WithSummary("Post the tenant's one-time opening balance entry")
            .RequirePermission(OnboardingPermissions.Onboarding.Complete)
            .WithIdempotency();
}
