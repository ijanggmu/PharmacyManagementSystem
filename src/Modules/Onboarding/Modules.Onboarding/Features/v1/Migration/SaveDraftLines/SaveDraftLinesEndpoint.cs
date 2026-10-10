using FSH.Framework.Shared.Identity.Authorization;
using FSH.Framework.Web.Idempotency;
using FSH.Modules.Onboarding.Contracts.Authorization;
using FSH.Modules.Onboarding.Contracts.v1.Migration;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Onboarding.Features.v1.Migration.SaveDraftLines;

public static class SaveDraftLinesEndpoint
{
    internal static RouteHandlerBuilder MapSaveDraftLinesEndpoint(this IEndpointRouteBuilder endpoints) =>
        endpoints.MapPost("/migration/sessions/{sessionId:guid}/draft-lines",
                async (Guid sessionId, SaveDraftLinesCommand body, IMediator mediator, CancellationToken ct) =>
                {
                    ArgumentNullException.ThrowIfNull(body);
                    var command = body with { SessionId = sessionId };
                    return Results.Ok(await mediator.Send(command, ct));
                })
            .WithName("SaveMigrationDraftLines")
            .WithSummary("Save (replacing) one category's draft opening-balance lines")
            .RequirePermission(OnboardingPermissions.Migration.Manage)
            .WithIdempotency();
}
