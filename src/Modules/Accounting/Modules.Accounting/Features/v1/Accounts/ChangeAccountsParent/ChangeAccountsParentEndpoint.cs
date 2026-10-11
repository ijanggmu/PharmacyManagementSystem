using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Accounting.Contracts.Authorization;
using FSH.Modules.Accounting.Contracts.v1.Accounts;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Accounting.Features.v1.Accounts.ChangeAccountsParent;

public static class ChangeAccountsParentEndpoint
{
    internal static RouteHandlerBuilder MapChangeAccountsParentEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapPost("/accounts/move",
                async (ChangeAccountsParentCommand body, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(body, ct)))
            .WithName("ChangeAccountsParent")
            .WithSummary("Move accounts (with their sub-accounts) under another parent; codes follow the new parent")
            .RequirePermission(AccountingPermissions.Accounts.Update);
    }
}
