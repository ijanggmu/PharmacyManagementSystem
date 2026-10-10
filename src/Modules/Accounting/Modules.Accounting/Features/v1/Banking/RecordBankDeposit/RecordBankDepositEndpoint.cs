using FSH.Framework.Shared.Identity.Authorization;
using FSH.Framework.Web.Idempotency;
using FSH.Modules.Accounting.Contracts.Authorization;
using FSH.Modules.Accounting.Contracts.v1.Banking;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Accounting.Features.v1.Banking.RecordBankDeposit;

public static class CreateBankDepositEndpoint
{
    internal static RouteHandlerBuilder MapCreateBankDepositEndpoint(this IEndpointRouteBuilder endpoints) =>
        endpoints.MapPost("/banking/deposits",
                async (RecordBankDepositCommand command, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(command, ct)))
            .WithName("CreateBankDeposit")
            .WithSummary("Record a bank deposit (Dr Bank / Cr Cash)")
            .RequirePermission(AccountingPermissions.Banking.RecordDeposit)
            .WithIdempotency();
}
