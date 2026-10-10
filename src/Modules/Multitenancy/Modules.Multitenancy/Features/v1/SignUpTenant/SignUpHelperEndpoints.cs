using FSH.Modules.Multitenancy.Contracts.v1.SignUpTenant;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Multitenancy.Features.v1.SignUpTenant;

public static class GetSignUpHelperEndpoint
{
    /// <summary>Anonymous provisioning progress, polled by the sign-up form. Only the general per-IP limit
    /// applies (the stricter "auth" limit would throttle polling); the correlation id is unguessable.</summary>
    public static RouteHandlerBuilder MapSignUpStatus(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/signup/{tenantId}/status", async (
                [FromRoute] string tenantId,
                [FromQuery] string correlationId,
                [FromServices] IMediator mediator,
                CancellationToken cancellationToken) =>
                TypedResults.Ok(await mediator.Send(new GetSignUpStatusQuery(tenantId, correlationId), cancellationToken)))
            .WithName("GetSignUpStatus")
            .WithSummary("Self-service sign-up progress")
            .AllowAnonymous()
            .Produces<SignUpStatusDto>(StatusCodes.Status200OK)
            .Produces(StatusCodes.Status404NotFound);
    }

    /// <summary>Anonymous live check that a pharmacy code and name are still free.</summary>
    public static RouteHandlerBuilder MapSignUpAvailability(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/signup/availability", async (
                [FromQuery] string? slug,
                [FromQuery] string? name,
                [FromServices] IMediator mediator,
                CancellationToken cancellationToken) =>
                TypedResults.Ok(await mediator.Send(new CheckSignUpAvailabilityQuery(slug, name), cancellationToken)))
            .WithName("CheckSignUpAvailability")
            .WithSummary("Check a pharmacy code and name are available")
            .AllowAnonymous()
            .Produces<SignUpAvailabilityDto>(StatusCodes.Status200OK);
    }
}
