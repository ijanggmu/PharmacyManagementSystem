using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Accounting.Contracts.Authorization;
using FSH.Modules.Accounting.Contracts.v1.Accounts;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Accounting.Features.v1.Accounts.ActivateAccount;

public static class EnableAccountEndpoint
{
    internal static RouteHandlerBuilder MapEnableAccountEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapPost("/accounts/{accountId:guid}/activate",
                async (Guid accountId, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(new ActivateAccountCommand(accountId), ct)))
            .WithName("EnableAccount")
            .WithSummary("Reactivate an account")
            .RequirePermission(AccountingPermissions.Accounts.Activate);
    }
}
