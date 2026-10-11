using FSH.Modules.Identity.Contracts.DTOs;
using FSH.Modules.Identity.Contracts.v1.TwoFactor;
using Mediator;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Identity.Features.v1.TwoFactor.Status;

public static class GetTwoFactorStatusEndpoint
{
    internal static RouteHandlerBuilder MapGetTwoFactorStatusEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/2fa/status",
                async (IMediator mediator, CancellationToken ct) =>
                    TypedResults.Ok(await mediator.Send(new GetTwoFactorStatusQuery(), ct)))
            .WithName("GetTwoFactorStatus")
            .WithSummary("Get two-factor status for the current user")
            .WithDescription("Returns whether 2FA is enabled and how many unused recovery codes remain.")
            .RequireAuthorization()
            .Produces<TwoFactorStatusResponse>(StatusCodes.Status200OK)
            .Produces(StatusCodes.Status401Unauthorized);
    }
}
