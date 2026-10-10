using FSH.Modules.Multitenancy.Contracts.Dtos;
using FSH.Modules.Multitenancy.Contracts.v1.GetTenantByCode;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Multitenancy.Features.v1.GetTenantByCode;

public static class GetTenantByCodeEndpoint
{
    public static RouteHandlerBuilder Map(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/by-code/{code}", async (string code, IMediator mediator, CancellationToken cancellationToken) =>
                TypedResults.Ok(await mediator.Send(new GetTenantByCodeQuery(code), cancellationToken)))
            .WithName("GetTenantByCode")
            .WithSummary("Get tenant by code (public)")
            .WithDescription("Anonymous lookup of an active tenant's name and code, used by the login page. Returns nulls when no active tenant matches.")
            .AllowAnonymous()
            .Produces<TenantLookupDto>(StatusCodes.Status200OK);
    }
}
