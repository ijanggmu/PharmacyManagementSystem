using FSH.Framework.Shared.Identity.Authorization;
using FSH.Framework.Web.Idempotency;
using FSH.Modules.Onboarding.Contracts.Authorization;
using FSH.Modules.Onboarding.Contracts.v1.Migration;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Onboarding.Features.v1.Migration.StartMigrationSession;

public static class StartMigrationSessionEndpoint
{
    internal static RouteHandlerBuilder MapStartMigrationSessionEndpoint(this IEndpointRouteBuilder endpoints) =>
        endpoints.MapPost("/migration/sessions",
                async (StartMigrationSessionCommand command, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(command, ct)))
            .WithName("StartMigrationSession")
            .WithSummary("Start the tenant's opening-balance migration wizard session")
            .RequirePermission(OnboardingPermissions.Migration.Manage)
            .WithIdempotency();
}
