using FSH.Modules.Identity.Contracts.v1.Approvals;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Identity.Features.v1.Approvals.IssueApproval;

public static class IssueApprovalEndpoint
{
    // Authenticated only (fallback policy): any signed-in user can ask; the APPROVER's permission is what is
    // checked, against the database. Mapped on the strict "auth" rate limit in IdentityModule.
    internal static RouteHandlerBuilder MapIssueApprovalEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapPost("/approvals",
                async (IssueApprovalCommand command, IMediator mediator, CancellationToken cancellationToken) =>
                    TypedResults.Ok(await mediator.Send(command, cancellationToken).ConfigureAwait(false)))
            .WithName("IssueApproval")
            .WithSummary("An approver re-enters their password to approve one restricted action for the signed-in user")
            .Produces<IssueApprovalResponse>(StatusCodes.Status200OK)
            .Produces(StatusCodes.Status400BadRequest)
            .Produces(StatusCodes.Status403Forbidden);
    }
}
