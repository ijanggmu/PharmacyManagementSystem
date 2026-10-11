using FSH.Modules.Identity.Contracts.v1.Tokens.RevokeRefreshToken;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Identity.Features.v1.Tokens.RevokeRefreshToken;

public static class RevokeRefreshTokenEndpoint
{
    public static RouteHandlerBuilder MapRevokeRefreshTokenEndpoint(this IEndpointRouteBuilder endpoint)
    {
        ArgumentNullException.ThrowIfNull(endpoint);

        return endpoint.MapPost("/token/revoke", async (
                [FromBody] RevokeRefreshTokenCommand command,
                [FromHeader(Name = "tenant")] string tenant,
                [FromServices] IMediator mediator,
                CancellationToken ct) =>
            {
                await mediator.Send(command, ct);
                return TypedResults.NoContent();
            })
            .WithName("RevokeRefreshToken")
            .WithSummary("Sign out: revoke a refresh token")
            .WithDescription("Revokes the session owning the given refresh token so it can no longer be refreshed. Anonymous (the refresh token is the proof of possession), idempotent, always 204.")
            .AllowAnonymous()
            .Produces(StatusCodes.Status204NoContent)
            .Produces(StatusCodes.Status400BadRequest);
    }
}
