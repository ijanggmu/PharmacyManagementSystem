using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Accounting.Contracts.Authorization;
using FSH.Modules.Accounting.Contracts.v1.PaymentAccounts;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Accounting.Features.v1.PaymentAccounts.GetPaymentMethodAccounts;

public static class GetPaymentMethodAccountsEndpoint
{
    internal static RouteHandlerBuilder MapGetPaymentMethodAccountsEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/payment-method-accounts",
                async (IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(new GetPaymentMethodAccountsQuery(), ct)))
            .WithName("GetPaymentMethodAccounts")
            .WithSummary("Get which cash/bank account each payment method posts to")
            .RequirePermission(AccountingPermissions.Accounts.View);
    }
}
