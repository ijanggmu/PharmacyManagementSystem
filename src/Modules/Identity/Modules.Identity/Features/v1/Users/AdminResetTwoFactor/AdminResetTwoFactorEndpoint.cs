using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Identity.Contracts.Authorization;
using FSH.Modules.Identity.Contracts.v1.Users.AdminResetTwoFactor;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Identity.Features.v1.Users.AdminResetTwoFactor;

public static class AdminResetTwoFactorEndpoint
{
    internal static RouteHandlerBuilder MapAdminResetTwoFactorEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapPost("/users/{id:guid}/2fa/reset", Handler)
        .WithName("AdminResetTwoFactor")
        .WithSummary("Reset a user's two-step verification (admin)")
        .RequirePermission(IdentityPermissions.Users.ResetTwoFactor)
        .WithDescription("Turns off 2FA for a user in the current tenant, rotates their authenticator key, clears recovery codes and revokes their sessions. The user signs in with just their password and must set up 2FA again.")
        .Produces(StatusCodes.Status204NoContent)
        .Produces(StatusCodes.Status401Unauthorized)
        .Produces(StatusCodes.Status403Forbidden)
        .Produces(StatusCodes.Status404NotFound);
    }

    private static async Task<NoContent> Handler(
        Guid id,
        IMediator mediator,
        CancellationToken cancellationToken)
    {
        await mediator.Send(new AdminResetTwoFactorCommand(id.ToString()), cancellationToken);
        return TypedResults.NoContent();
    }
}
