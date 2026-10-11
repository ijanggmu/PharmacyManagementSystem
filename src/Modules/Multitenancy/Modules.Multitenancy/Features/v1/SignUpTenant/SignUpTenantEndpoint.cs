using FSH.Framework.Web.Idempotency;
using FSH.Modules.Multitenancy.Contracts.v1.SignUpTenant;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Multitenancy.Features.v1.SignUpTenant;

public static class SelfSignUpTenantEndpoint
{
    public static RouteHandlerBuilder Map(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapPost("/signup", async (
            [FromBody] SignUpTenantCommand command,
            [FromServices] IMediator mediator,
            CancellationToken cancellationToken)
            =>
            {
                var result = await mediator.Send(command, cancellationToken);
                return TypedResults.Created($"/api/v1/tenants/{result.TenantId}", result);
            })
            .WithName("SignUpTenant")
            .WithSummary("Self-service tenant signup")
            .WithDescription(
                "Anonymous: a brand-new visitor creates their own pharmacy tenant and becomes its " +
                "Admin. Reuses CreateTenant with the configured free/trial plan — no payment is collected.")
            .AllowAnonymous()
            .RequireRateLimiting("auth")
            .WithIdempotency()
            .Produces<SignUpTenantCommandResponse>(StatusCodes.Status201Created)
            .Produces(StatusCodes.Status400BadRequest)
            .Produces(StatusCodes.Status429TooManyRequests);
    }
}
