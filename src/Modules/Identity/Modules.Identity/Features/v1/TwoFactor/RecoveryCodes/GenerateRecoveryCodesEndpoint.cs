using FSH.Modules.Identity.Contracts.DTOs;
using FSH.Modules.Identity.Contracts.v1.TwoFactor;
using Mediator;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Identity.Features.v1.TwoFactor.RecoveryCodes;

public static class GenerateRecoveryCodesEndpoint
{
    internal static RouteHandlerBuilder MapGenerateRecoveryCodesEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapPost("/2fa/recovery-codes",
                async (RegenerateRecoveryCodesCommand command, IMediator mediator, CancellationToken ct) =>
                    TypedResults.Ok(await mediator.Send(command, ct)))
            .WithName("RegenerateTwoFactorRecoveryCodes")
            .WithSummary("Regenerate two-factor recovery codes")
            .WithDescription("Replaces the current user's recovery codes with a new set after confirming the current password. Requires 2FA to be enabled. Earlier codes stop working.")
            .RequireAuthorization()
            .Produces<TwoFactorRecoveryCodesResponse>(StatusCodes.Status200OK)
            .Produces(StatusCodes.Status400BadRequest)
            .Produces(StatusCodes.Status401Unauthorized);
    }
}
