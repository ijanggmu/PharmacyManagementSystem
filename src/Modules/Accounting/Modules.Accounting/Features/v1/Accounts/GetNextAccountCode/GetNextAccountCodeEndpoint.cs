using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Accounting.Contracts.Authorization;
using FSH.Modules.Accounting.Contracts.v1.Accounts;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Accounting.Features.v1.Accounts.GetNextAccountCode;

public static class GetNextAccountCodeEndpoint
{
    internal static RouteHandlerBuilder MapGetNextAccountCodeEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/accounts/next-code",
                async (Guid parentId, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(new GetNextAccountCodeQuery(parentId), ct)))
            .WithName("GetNextAccountCode")
            .WithSummary("Preview the code a new account under this parent would get")
            .RequirePermission(AccountingPermissions.Accounts.Create);
    }
}
