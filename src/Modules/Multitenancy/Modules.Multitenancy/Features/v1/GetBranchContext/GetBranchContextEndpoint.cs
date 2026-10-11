using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Multitenancy.Contracts.Authorization;
using FSH.Modules.Multitenancy.Contracts.Dtos;
using FSH.Modules.Multitenancy.Contracts.v1.GetBranchContext;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Multitenancy.Features.v1.GetBranchContext;

public static class GetBranchContextEndpoint
{
    public static RouteHandlerBuilder Map(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/context", async (IMediator mediator, CancellationToken cancellationToken) =>
                TypedResults.Ok(await mediator.Send(new GetBranchContextQuery(), cancellationToken)))
            .WithName("GetBranchContext")
            .WithSummary("Get branch context")
            .WithDescription("List the current tenant's branches and the caller's current branch.")
            .RequirePermission(MultitenancyPermissions.Branches.View)
            .Produces<BranchContextDto>(StatusCodes.Status200OK)
            .Produces(StatusCodes.Status401Unauthorized)
            .Produces(StatusCodes.Status403Forbidden);
    }
}
