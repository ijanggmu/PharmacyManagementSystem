using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Accounting.Contracts.Authorization;
using FSH.Modules.Accounting.Contracts.v1.PostingLock;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Accounting.Features.v1.PostingLock.GetPostingLock;

public static class GetPostingLockEndpoint
{
    internal static RouteHandlerBuilder MapGetPostingLockEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/posting-lock",
                async (IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(new GetPostingLockQuery(), ct)))
            .WithName("GetPostingLock")
            .WithSummary("Get the current accounting period posting-lock date")
            .RequirePermission(AccountingPermissions.PostingLock.View);
    }
}
