using Finbuckle.MultiTenant.Abstractions;
using FSH.Framework.Shared.Multitenancy;
using FSH.Framework.Web.Idempotency;
using FSH.Modules.Identity.Contracts.v1.Users.RegisterUser;
using FSH.Modules.Identity.Contracts.v1.Users.SelfRegisterUser;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Options;

namespace FSH.Modules.Identity.Features.v1.Users.SelfRegistration;

public static class SelfRegisterUserEndpoint
{
    internal static RouteHandlerBuilder MapSelfRegisterUserEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapPost("/self-register", async Task<IResult> (SelfRegisterUserCommand command,
            [FromHeader(Name = MultitenancyConstants.Identifier)] string tenant,
            HttpContext context,
            IMultiTenantContextAccessor<AppTenantInfo> tenantAccessor,
            IOptions<SelfRegistrationOptions> options,
            IMediator mediator,
            CancellationToken cancellationToken) =>
        {
            // Off unless this tenant opted in. Checked before validation so a disabled tenant does not
            // even reveal the payload rules (404 = "no such feature here").
            if (!options.Value.IsAllowed(tenantAccessor.MultiTenantContext?.TenantInfo?.Id))
            {
                return TypedResults.NotFound();
            }

            var origin = $"{context.Request.Scheme}://{context.Request.Host.Value}{context.Request.PathBase.Value}";
            command.Origin = origin;
            var result = await mediator.Send(command, cancellationToken);
            return TypedResults.Created($"/api/v1/identity/users/{result.UserId}", result);
        })
        .WithName("SelfRegisterUser")
        .WithSummary("Self register user")
        .WithDescription("Anonymous self-registration into a tenant that opted in (SelfRegistration:AllowedTenants). The account is unconfirmed until the emailed link is used. 404 when the tenant has not enabled it.")
        .AllowAnonymous()
        .WithIdempotency()
        .Produces<RegisterUserResponse>(StatusCodes.Status201Created)
        .Produces(StatusCodes.Status400BadRequest)
        .Produces(StatusCodes.Status404NotFound);
    }
}
