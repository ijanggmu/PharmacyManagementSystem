using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Onboarding.Contracts.Authorization;
using FSH.Modules.Onboarding.Contracts.v1.Migration;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Onboarding.Features.v1.Migration.GetMigrationSessionStatus;

public static class GetMigrationSessionStatusEndpoint
{
    internal static RouteHandlerBuilder MapGetMigrationSessionStatusEndpoint(this IEndpointRouteBuilder endpoints) =>
        endpoints.MapGet("/migration/sessions/current",
                async (IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(new GetMigrationSessionStatusQuery(), ct)))
            .WithName("GetMigrationSessionStatus")
            .WithSummary("Get the tenant's migration wizard session (null if not started)")
            .RequirePermission(OnboardingPermissions.Migration.View);
}
