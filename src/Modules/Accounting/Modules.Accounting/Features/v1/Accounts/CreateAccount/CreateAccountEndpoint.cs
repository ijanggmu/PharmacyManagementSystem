using FSH.Framework.Shared.Identity.Authorization;
using FSH.Framework.Web.Idempotency;
using FSH.Modules.Accounting.Contracts.Authorization;
using FSH.Modules.Accounting.Contracts.v1.Accounts;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Accounting.Features.v1.Accounts.CreateAccount;

public static class CreateAccountEndpoint
{
    internal static RouteHandlerBuilder MapCreateAccountEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapPost("/accounts",
                async (CreateAccountCommand command, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(command, ct)))
            .WithName("CreateAccount")
            .WithSummary("Create a chart-of-accounts entry")
            .RequirePermission(AccountingPermissions.Accounts.Create)
            .WithIdempotency();
    }
}
