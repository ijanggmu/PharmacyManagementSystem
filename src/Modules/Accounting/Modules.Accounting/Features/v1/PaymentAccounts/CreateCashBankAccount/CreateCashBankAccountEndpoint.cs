using FSH.Framework.Shared.Identity.Authorization;
using FSH.Framework.Web.Idempotency;
using FSH.Modules.Accounting.Contracts.Authorization;
using FSH.Modules.Accounting.Contracts.v1.PaymentAccounts;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Accounting.Features.v1.PaymentAccounts.CreateCashBankAccount;

public static class CreateCashBankAccountEndpoint
{
    internal static RouteHandlerBuilder MapCreateCashBankAccountEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapPost("/accounts/cash-bank",
                async (CreateCashBankAccountCommand command, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(command, ct)))
            .WithName("CreateCashBankAccount")
            .WithSummary("Add a cash, bank or wallet account in the 10xx cash & bank block")
            .RequirePermission(AccountingPermissions.Accounts.Create)
            .WithIdempotency();
    }
}
