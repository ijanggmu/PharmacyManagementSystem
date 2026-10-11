using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Accounting.Contracts.Authorization;
using FSH.Modules.Accounting.Contracts.v1.Accounts;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Accounting.Features.v1.Accounts.UpdateAccount;

public static class UpdateAccountEndpoint
{
    internal static RouteHandlerBuilder MapUpdateAccountEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapPut("/accounts/{accountId:guid}",
                async (Guid accountId, UpdateAccountCommand body, IMediator mediator, CancellationToken ct) =>
                {
                    ArgumentNullException.ThrowIfNull(body);
                    var command = body with { AccountId = accountId };
                    return Results.Ok(await mediator.Send(command, ct));
                })
            .WithName("UpdateAccount")
            .WithSummary("Rename an account")
            .RequirePermission(AccountingPermissions.Accounts.Update);
    }
}
