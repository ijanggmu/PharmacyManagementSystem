using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Accounting.Contracts.Authorization;
using FSH.Modules.Accounting.Contracts.v1.Banking;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Accounting.Features.v1.Banking.ReconcileBankAccount;

public static class CreateBankReconciliationEndpoint
{
    internal static RouteHandlerBuilder MapCreateBankReconciliationEndpoint(this IEndpointRouteBuilder endpoints) =>
        endpoints.MapPost("/banking/reconciliations",
                async (ReconcileBankAccountCommand command, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(command, ct)))
            .WithName("CreateBankReconciliation")
            .WithSummary("Compare a cash/bank account's GL balance (Bank by default) against a statement balance")
            .RequirePermission(AccountingPermissions.Banking.Reconcile);
}
