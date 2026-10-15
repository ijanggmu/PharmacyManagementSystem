using FSH.Modules.Identity.Contracts.v1.Tokens.ResolvePasswordLogin;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Identity.Features.v1.Tokens.ResolvePasswordLogin;

public static class ResolvePasswordLoginEndpoint
{
    /// <summary>Anonymous: the pharmacies an email + password signs in to.</summary>
    internal static RouteHandlerBuilder MapResolvePasswordLoginEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapPost("/token/resolve",
                async ([FromBody] ResolvePasswordLoginQuery query, [FromServices] IMediator mediator, CancellationToken ct) =>
                    TypedResults.Ok(await mediator.Send(query, ct)))
            .WithName("ResolvePasswordLogin")
            .WithSummary("Find the pharmacies an email and password sign in to")
            .WithDescription("Lets a user sign in without a pharmacy code. Lists only pharmacies where the password is correct; a wrong password or unknown email returns an empty list and counts toward the lockout.")
            .AllowAnonymous()
            .RequireRateLimiting("auth")
            .Produces<PasswordLoginResolution>(StatusCodes.Status200OK)
            .Produces(StatusCodes.Status400BadRequest)
            .Produces(StatusCodes.Status423Locked);
    }
}
