using FSH.Framework.Shared.Multitenancy;
using FSH.Modules.Identity.Contracts.DTOs;
using FSH.Modules.Identity.Contracts.v1.ExternalLogins;
using FSH.Modules.Identity.Features.v1.Tokens.TokenGeneration;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Routing;
using System.ComponentModel;

namespace FSH.Modules.Identity.Features.v1.ExternalLogins;

public static class AddExternalLoginEndpoint
{
    /// <summary>Anonymous: sign in with a Google ID token into the tenant from the <c>tenant</c> header.</summary>
    internal static RouteHandlerBuilder MapGoogleTokenEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapPost("/token/google",
            async Task<Results<Ok<TokenResponse>, ProblemHttpResult>> (
                [FromBody] GoogleTokenCommand command,
                [DefaultValue("root")][FromHeader] string tenant,
                [FromHeader(Name = GenerateTokenEndpoint.AppHeader)] string? app,
                [FromServices] IMediator mediator,
                CancellationToken ct) =>
            {
                // Same app boundary as the password login: SuperAdmins use the admin app only.
                if (string.Equals(tenant, MultitenancyConstants.Root.Id, StringComparison.OrdinalIgnoreCase)
                    && string.Equals(app, GenerateTokenEndpoint.AppDashboard, StringComparison.OrdinalIgnoreCase))
                {
                    return TypedResults.Problem(
                        statusCode: StatusCodes.Status403Forbidden,
                        title: "App boundary",
                        detail: "SuperAdmin accounts must use the admin app. Sign in there instead of the tenant dashboard.");
                }

                return TypedResults.Ok(await mediator.Send(command, ct));
            })
            .WithName("IssueTokensWithGoogle")
            .WithSummary("Sign in with Google")
            .WithDescription("Exchange a Google ID token for JWT access/refresh tokens. The Google account must already be connected to a user of the tenant in the 'tenant' header. Same checks as the password login, including two-factor.")
            .AllowAnonymous()
            .RequireRateLimiting("auth")
            .Produces<TokenResponse>(StatusCodes.Status200OK)
            .Produces(StatusCodes.Status401Unauthorized)
            .Produces(StatusCodes.Status403Forbidden)
            .Produces(StatusCodes.Status404NotFound);
    }

    /// <summary>Anonymous: which pharmacies a verified Google account is connected to.</summary>
    internal static RouteHandlerBuilder MapResolveGoogleLoginEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapPost("/google/resolve",
                async ([FromBody] ResolveGoogleLoginQuery query, [FromServices] IMediator mediator, CancellationToken ct) =>
                    TypedResults.Ok(await mediator.Send(query, ct)))
            .WithName("ResolveGoogleLogin")
            .WithSummary("Find the pharmacies a Google account is connected to")
            .WithDescription("Requires a valid Google ID token, so it can't be used to look up accounts by email.")
            .AllowAnonymous()
            .RequireRateLimiting("auth")
            .Produces<GoogleLoginResolution>(StatusCodes.Status200OK)
            .Produces(StatusCodes.Status401Unauthorized)
            .Produces(StatusCodes.Status404NotFound);
    }

    /// <summary>Anonymous: verify a Google account for sign-up and return the profile to prefill.</summary>
    internal static RouteHandlerBuilder MapVerifyGoogleSignUpEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapPost("/google/verify-signup",
                async ([FromBody] VerifyGoogleSignUpQuery query, [FromServices] IMediator mediator, CancellationToken ct) =>
                    TypedResults.Ok(await mediator.Send(query, ct)))
            .WithName("VerifyGoogleSignUp")
            .WithSummary("Verify a Google account for pharmacy sign-up")
            .AllowAnonymous()
            .RequireRateLimiting("auth")
            .Produces<GoogleSignUpProfile>(StatusCodes.Status200OK)
            .Produces(StatusCodes.Status401Unauthorized)
            .Produces(StatusCodes.Status404NotFound);
    }

    internal static RouteHandlerBuilder MapGetMyExternalLoginsEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/external-logins",
                async ([FromServices] IMediator mediator, CancellationToken ct) =>
                    TypedResults.Ok(await mediator.Send(new GetMyExternalLoginsQuery(), ct)))
            .WithName("GetMyExternalLogins")
            .WithSummary("Connected accounts of the current user")
            .RequireAuthorization()
            .Produces<MyExternalLoginsDto>(StatusCodes.Status200OK)
            .Produces(StatusCodes.Status401Unauthorized);
    }

    internal static RouteHandlerBuilder MapConnectGoogleLoginEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapPost("/external-logins/google",
                async ([FromBody] ConnectGoogleLoginCommand command, [FromServices] IMediator mediator, CancellationToken ct) =>
                    TypedResults.Ok(await mediator.Send(command, ct)))
            .WithName("ConnectGoogleLogin")
            .WithSummary("Connect a Google account to the current user")
            .RequireAuthorization()
            .RequireRateLimiting("auth")
            .Produces<ExternalLoginDto>(StatusCodes.Status200OK)
            .Produces(StatusCodes.Status401Unauthorized)
            .Produces(StatusCodes.Status409Conflict);
    }

    internal static RouteHandlerBuilder MapDisconnectGoogleLoginEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapDelete("/external-logins/google",
                async ([FromServices] IMediator mediator, CancellationToken ct) =>
                    TypedResults.Ok(new { disconnected = await mediator.Send(new DisconnectGoogleLoginCommand(), ct) }))
            .WithName("DisconnectGoogleLogin")
            .WithSummary("Disconnect the current user's Google account")
            .RequireAuthorization()
            .Produces(StatusCodes.Status200OK)
            .Produces(StatusCodes.Status401Unauthorized)
            .Produces(StatusCodes.Status409Conflict);
    }
}
