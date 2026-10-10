using FSH.Framework.Shared.Identity.Authorization;
using FSH.Framework.Web.Idempotency;
using FSH.Modules.Onboarding.Contracts.Authorization;
using FSH.Modules.Onboarding.Contracts.v1.Migration;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Onboarding.Features.v1.Migration.CommitMigrationSession;

public static class CommitMigrationSessionEndpoint
{
    internal static RouteHandlerBuilder MapCommitMigrationSessionEndpoint(this IEndpointRouteBuilder endpoints) =>
        endpoints.MapPost("/migration/sessions/{sessionId:guid}/commit",
                async (Guid sessionId, Guid? branchId, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(new CommitMigrationSessionCommand(sessionId, branchId), ct)))
            .WithName("CommitMigrationSession")
            .WithSummary("Post every saved category's opening balances and lock the migration session")
            .RequirePermission(OnboardingPermissions.Migration.Manage)
            .WithIdempotency();
}
