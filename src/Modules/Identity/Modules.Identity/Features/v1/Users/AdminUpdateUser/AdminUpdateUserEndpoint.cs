using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Identity.Contracts.Authorization;
using FSH.Modules.Identity.Contracts.v1.Users.AdminUpdateUser;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Identity.Features.v1.Users.AdminUpdateUser;

public static class AdminUpdateUserEndpoint
{
    internal static RouteHandlerBuilder MapAdminUpdateUserEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapPut("/users/{id:guid}", Handler)
        .WithName("AdminUpdateUser")
        .WithSummary("Update user (administrator)")
        .RequirePermission(IdentityPermissions.Users.Update)
        .WithDescription("Update another user's name, phone, active flag and roles. Only administrators can change roles. A user cannot deactivate themselves.")
        .Produces(StatusCodes.Status204NoContent)
        .Produces(StatusCodes.Status401Unauthorized)
        .Produces(StatusCodes.Status403Forbidden)
        .Produces(StatusCodes.Status400BadRequest)
        .Produces(StatusCodes.Status404NotFound);
    }

    private static async Task<Results<NoContent, BadRequest>> Handler(
        string id,
        [FromBody] AdminUpdateUserCommand command,
        IMediator mediator,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(command.Id))
        {
            command.Id = id;
        }

        if (!string.Equals(id, command.Id, StringComparison.Ordinal))
        {
            return TypedResults.BadRequest();
        }

        await mediator.Send(command, cancellationToken);
        return TypedResults.NoContent();
    }
}
