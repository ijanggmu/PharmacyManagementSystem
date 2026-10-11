using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Multitenancy.Contracts.Authorization;
using FSH.Modules.Multitenancy.Contracts.Dtos;
using FSH.Modules.Multitenancy.Contracts.v1.DeactivateBranch;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Multitenancy.Features.v1.DeactivateBranch;

public static class DeleteBranchEndpoint
{
    public static RouteHandlerBuilder Map(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapDelete("/{id:guid}", async (Guid id, IMediator mediator, CancellationToken cancellationToken) =>
            {
                BranchDto result = await mediator.Send(new DeactivateBranchCommand(id), cancellationToken);
                return Results.Ok(result);
            })
            .WithName("DeactivateBranch")
            .WithSummary("Deactivate branch")
            .WithDescription("Soft-deactivates a branch. Refused (409) for the tenant default branch and for the last active branch.")
            .RequirePermission(MultitenancyPermissions.Branches.Manage)
            .Produces<BranchDto>(StatusCodes.Status200OK)
            .Produces(StatusCodes.Status401Unauthorized)
            .Produces(StatusCodes.Status403Forbidden)
            .Produces(StatusCodes.Status404NotFound)
            .Produces(StatusCodes.Status409Conflict);
    }
}
