using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Multitenancy.Contracts.Authorization;
using FSH.Modules.Multitenancy.Contracts.Dtos;
using FSH.Modules.Multitenancy.Contracts.v1.SwitchBranch;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Multitenancy.Features.v1.SwitchBranch;

public static class SwitchBranchEndpoint
{
    public static RouteHandlerBuilder Map(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapPost("/switch", async (
                [FromBody] SwitchBranchCommand command,
                [FromServices] IMediator mediator,
                CancellationToken cancellationToken) =>
                TypedResults.Ok(await mediator.Send(command, cancellationToken)))
            .WithName("SwitchBranch")
            .WithSummary("Switch current branch")
            .WithDescription("Updates the caller's current-branch selection and returns the refreshed branch context.")
            .RequirePermission(MultitenancyPermissions.Branches.Switch)
            .Produces<BranchContextDto>(StatusCodes.Status200OK)
            .Produces(StatusCodes.Status400BadRequest)
            .Produces(StatusCodes.Status401Unauthorized)
            .Produces(StatusCodes.Status403Forbidden)
            .Produces(StatusCodes.Status404NotFound);
    }
}
