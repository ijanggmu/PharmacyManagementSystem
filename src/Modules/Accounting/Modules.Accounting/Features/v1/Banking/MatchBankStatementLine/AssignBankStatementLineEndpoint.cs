using FSH.Framework.Shared.Identity.Authorization;
using FSH.Framework.Web.Idempotency;
using FSH.Modules.Accounting.Contracts.Authorization;
using FSH.Modules.Accounting.Contracts.v1.Banking;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Accounting.Features.v1.Banking.MatchBankStatementLine;

public static class AssignBankStatementLineEndpoint
{
    internal static RouteHandlerBuilder MapAssignBankStatementLineEndpoint(this IEndpointRouteBuilder endpoints) =>
        endpoints.MapPost("/banking/statement-imports/lines/{lineId:guid}/match",
                async (Guid lineId, [FromBody] AssignBankStatementLineBody body, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(new MatchBankStatementLineCommand(lineId, body.VoucherLineId), ct)))
            .WithName("MatchBankStatementLine")
            .WithSummary("Manually pair a statement line with a posted GL voucher line")
            .RequirePermission(AccountingPermissions.Banking.Reconcile)
            .WithIdempotency();

    // Body shape: LineId comes from the route, so we only accept VoucherLineId in the body.
    public sealed record AssignBankStatementLineBody(Guid VoucherLineId);
}
