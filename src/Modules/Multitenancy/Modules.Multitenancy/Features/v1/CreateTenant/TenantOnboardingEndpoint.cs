using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Multitenancy.Contracts.Authorization;
using FSH.Modules.Multitenancy.Contracts.v1.CreateTenant;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Multitenancy.Features.v1.CreateTenant;

public static class TenantOnboardingEndpoint
{
    /// <summary>Live preview for the create form: the code the tenant would get and whether the name is free.</summary>
    public static RouteHandlerBuilder MapSuggestTenantCode(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/code-suggestion", async (
                [FromQuery] string? name,
                [FromServices] IMediator mediator,
                CancellationToken cancellationToken) =>
                TypedResults.Ok(await mediator.Send(new SuggestTenantCodeQuery(name), cancellationToken)))
            .WithName("SuggestTenantCode")
            .WithSummary("Suggest a tenant code for a pharmacy name")
            .RequirePermission(MultitenancyPermissions.Tenants.Create)
            .Produces<TenantCodeSuggestionDto>(StatusCodes.Status200OK)
            .Produces(StatusCodes.Status401Unauthorized)
            .Produces(StatusCodes.Status403Forbidden);
    }

    /// <summary>What the create-tenant success screen can offer, e.g. whether email is configured.</summary>
    public static RouteHandlerBuilder MapTenantOnboardingOptions(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/onboarding-options", async (
                [FromServices] IMediator mediator,
                CancellationToken cancellationToken) =>
                TypedResults.Ok(await mediator.Send(new GetTenantOnboardingOptionsQuery(), cancellationToken)))
            .WithName("GetTenantOnboardingOptions")
            .WithSummary("What the create-tenant flow can offer (e.g. welcome email)")
            .RequirePermission(MultitenancyPermissions.Tenants.Create)
            .Produces<TenantOnboardingOptionsDto>(StatusCodes.Status200OK)
            .Produces(StatusCodes.Status401Unauthorized)
            .Produces(StatusCodes.Status403Forbidden);
    }

    /// <summary>Emails the new tenant's admin their PharmaCare sign-in details.</summary>
    public static RouteHandlerBuilder MapSendTenantWelcomeEmail(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapPost("/{id}/welcome-email", async (
                [FromRoute] string id,
                [FromBody] SendTenantWelcomeEmailCommand command,
                [FromServices] IMediator mediator,
                CancellationToken cancellationToken) =>
            {
                if (!string.Equals(id, command.TenantId, StringComparison.Ordinal))
                {
                    return Results.BadRequest();
                }

                await mediator.Send(command, cancellationToken);
                return Results.NoContent();
            })
            .WithName("SendTenantWelcomeEmail")
            .WithSummary("Email the tenant admin their welcome and sign-in details")
            .RequirePermission(MultitenancyPermissions.Tenants.Create)
            .Produces(StatusCodes.Status204NoContent)
            .Produces(StatusCodes.Status400BadRequest)
            .Produces(StatusCodes.Status401Unauthorized)
            .Produces(StatusCodes.Status403Forbidden)
            .Produces(StatusCodes.Status404NotFound)
            .Produces(StatusCodes.Status409Conflict)
            .Produces(StatusCodes.Status502BadGateway);
    }
}
