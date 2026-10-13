using FSH.Framework.Shared.Identity.Authorization;
using FSH.Framework.Shared.Persistence;
using FSH.Modules.Identity.Contracts.Authorization;
using FSH.Modules.Identity.Contracts.v1.Approvals;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Identity.Features.v1.Approvals.SearchApprovals;

public static class SearchApprovalsEndpoint
{
    internal static RouteHandlerBuilder MapSearchApprovalsEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/approvals",
                async ([AsParameters] SearchApprovalsQuery query, IMediator mediator, CancellationToken cancellationToken) =>
                    TypedResults.Ok(await mediator.Send(query, cancellationToken).ConfigureAwait(false)))
            .WithName("SearchApprovals")
            .WithSummary("The approvals log: who approved which restricted action, for whom, when, and whether it was used")
            .RequirePermission(IdentityPermissions.Approvals.View)
            .Produces<PagedResponse<ApprovalLogEntryDto>>(StatusCodes.Status200OK);
    }
}
