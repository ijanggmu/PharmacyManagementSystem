using FSH.Framework.Shared.Identity.Authorization;
using FSH.Framework.Web.Idempotency;
using FSH.Modules.Accounting.Contracts.Authorization;
using FSH.Modules.Accounting.Contracts.v1.Banking;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Accounting.Features.v1.Banking.UnmatchBankStatementLine;

public static class ResetBankStatementLineMatchEndpoint
{
    internal static RouteHandlerBuilder MapResetBankStatementLineMatchEndpoint(this IEndpointRouteBuilder endpoints) =>
        endpoints.MapPost("/banking/statement-imports/lines/{lineId:guid}/unmatch",
                async (Guid lineId, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(new UnmatchBankStatementLineCommand(lineId), ct)))
            .WithName("UnmatchBankStatementLine")
            .WithSummary("Revert a statement line to unmatched")
            .RequirePermission(AccountingPermissions.Banking.Reconcile)
            .WithIdempotency();
}
