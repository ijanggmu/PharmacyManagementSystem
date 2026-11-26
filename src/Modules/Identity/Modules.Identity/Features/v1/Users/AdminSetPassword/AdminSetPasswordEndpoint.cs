using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Identity.Contracts.Authorization;
using FSH.Modules.Identity.Contracts.v1.Users.AdminSetPassword;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Identity.Features.v1.Users.AdminSetPassword;

public static class AdminSetPasswordEndpoint
{
    internal static RouteHandlerBuilder MapAdminSetPasswordEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapPost("/users/{id:guid}/password", Handler)
        .WithName("AdminSetPassword")
        .WithSummary("Set a user's password (admin)")
        .RequirePermission(IdentityPermissions.Users.Update)
        .WithDescription("Administrators only. Sets a new password for another user in the current tenant. It must meet the password policy. Revokes all of the user's sessions and clears any lockout.")
        .Produces(StatusCodes.Status204NoContent)
        .Produces(StatusCodes.Status400BadRequest)
        .Produces(StatusCodes.Status401Unauthorized)
        .Produces(StatusCodes.Status403Forbidden)
        .Produces(StatusCodes.Status404NotFound);
    }

    private static async Task<Results<NoContent, BadRequest>> Handler(
        Guid id,
        AdminSetPasswordCommand command,
        IMediator mediator,
        CancellationToken cancellationToken)
    {
        if (!string.Equals(id.ToString(), command.UserId, StringComparison.OrdinalIgnoreCase))
        {
            return TypedResults.BadRequest();
        }

        await mediator.Send(command, cancellationToken);
        return TypedResults.NoContent();
    }
}
