using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Multitenancy.Contracts.Authorization;
using FSH.Modules.Multitenancy.Contracts.Dtos;
using FSH.Modules.Multitenancy.Contracts.v1.UpdateBranch;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Multitenancy.Features.v1.UpdateBranch;

public static class UpdateBranchEndpoint
{
    public static RouteHandlerBuilder Map(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapPut("/{id:guid}", Handler)
            .WithName("UpdateBranch")
            .WithSummary("Update branch")
            .WithDescription("Update a branch's name, code, contact details, and active state.")
            .RequirePermission(MultitenancyPermissions.Branches.Manage)
            .Produces<BranchDto>(StatusCodes.Status200OK)
            .Produces(StatusCodes.Status400BadRequest)
            .Produces(StatusCodes.Status401Unauthorized)
            .Produces(StatusCodes.Status403Forbidden)
            .Produces(StatusCodes.Status404NotFound);
    }

    private static async Task<Results<Ok<BranchDto>, BadRequest>> Handler(
        [FromRoute] Guid id,
        [FromBody] UpdateBranchCommand command,
        IMediator mediator,
        CancellationToken cancellationToken)
    {
        if (id != command.Id)
        {
            return TypedResults.BadRequest();
        }

        BranchDto result = await mediator.Send(command, cancellationToken);
        return TypedResults.Ok(result);
    }
}
