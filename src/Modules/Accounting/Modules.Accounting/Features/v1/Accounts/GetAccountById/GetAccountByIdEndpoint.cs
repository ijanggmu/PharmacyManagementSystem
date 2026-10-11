using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Accounting.Contracts.Authorization;
using FSH.Modules.Accounting.Contracts.v1.Accounts;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Accounting.Features.v1.Accounts.GetAccountById;

public static class GetAccountByIdEndpoint
{
    internal static RouteHandlerBuilder MapGetAccountByIdEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/accounts/{accountId:guid}",
                (Guid accountId, IMediator mediator, CancellationToken ct) =>
                    mediator.Send(new GetAccountByIdQuery(accountId), ct))
            .WithName("GetAccountById")
            .WithSummary("Get an account by id")
            .RequirePermission(AccountingPermissions.Accounts.View);
    }
}
