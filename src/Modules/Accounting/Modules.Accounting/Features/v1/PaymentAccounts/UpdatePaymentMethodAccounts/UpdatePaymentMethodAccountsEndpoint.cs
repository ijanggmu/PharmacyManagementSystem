using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Accounting.Contracts.Authorization;
using FSH.Modules.Accounting.Contracts.v1.PaymentAccounts;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Accounting.Features.v1.PaymentAccounts.UpdatePaymentMethodAccounts;

public static class UpdatePaymentMethodAccountsEndpoint
{
    internal static RouteHandlerBuilder MapUpdatePaymentMethodAccountsEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapPut("/payment-method-accounts",
                async (UpdatePaymentMethodAccountsCommand command, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(command, ct)))
            .WithName("UpdatePaymentMethodAccounts")
            .WithSummary("Point payment methods at cash/bank accounts (null resets a method to its default)")
            .RequirePermission(AccountingPermissions.Accounts.Update);
    }
}
