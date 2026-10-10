using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Accounting.Contracts.Authorization;
using FSH.Modules.Accounting.Contracts.v1.Accounts;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Accounting.Features.v1.Accounts.DeactivateAccount;

public static class DisableAccountEndpoint
{
    internal static RouteHandlerBuilder MapDisableAccountEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapPost("/accounts/{accountId:guid}/deactivate",
                async (Guid accountId, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(new DeactivateAccountCommand(accountId), ct)))
            .WithName("DisableAccount")
            .WithSummary("Deactivate an account")
            .RequirePermission(AccountingPermissions.Accounts.Deactivate);
    }
}
