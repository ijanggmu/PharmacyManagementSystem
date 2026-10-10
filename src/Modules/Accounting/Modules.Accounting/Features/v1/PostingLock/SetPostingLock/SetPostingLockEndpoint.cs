using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Accounting.Contracts.Authorization;
using FSH.Modules.Accounting.Contracts.v1.PostingLock;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Accounting.Features.v1.PostingLock.SetPostingLock;

public static class SetPostingLockEndpoint
{
    internal static RouteHandlerBuilder MapSetPostingLockEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapPut("/posting-lock",
                async (SetPostingLockCommand command, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(command, ct)))
            .WithName("SetPostingLock")
            .WithSummary("Set (or clear) the accounting period posting-lock date")
            .RequirePermission(AccountingPermissions.PostingLock.Update);
    }
}
