using FSH.Modules.Identity.Contracts.DTOs;
using FSH.Modules.Identity.Contracts.v1.TwoFactor;
using Mediator;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Identity.Features.v1.TwoFactor.VerifyEnroll;

public static class VerifyEnrollTwoFactorEndpoint
{
    internal static RouteHandlerBuilder MapVerifyEnrollTwoFactorEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapPost("/2fa/verify",
                async (VerifyEnrollTwoFactorCommand command, IMediator mediator, CancellationToken ct) =>
                    TypedResults.Ok(await mediator.Send(command, ct)))
            .WithName("VerifyEnrollTwoFactor")
            .WithSummary("Confirm TOTP enrollment")
            .WithDescription("Verifies the 6-digit code from the authenticator app. On success, 2FA is enabled, subsequent logins must include a code, and the response carries 10 one-time recovery codes ({ success, recoveryCodes }) that are never shown again.")
            .RequireAuthorization()
            .Produces<TwoFactorVerifyResponse>(StatusCodes.Status200OK)
            .Produces(StatusCodes.Status400BadRequest)
            .Produces(StatusCodes.Status401Unauthorized);
    }
}
