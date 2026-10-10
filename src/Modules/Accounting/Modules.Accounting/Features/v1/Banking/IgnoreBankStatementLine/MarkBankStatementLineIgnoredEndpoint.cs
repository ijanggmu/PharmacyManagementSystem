using FSH.Framework.Shared.Identity.Authorization;
using FSH.Framework.Web.Idempotency;
using FSH.Modules.Accounting.Contracts.Authorization;
using FSH.Modules.Accounting.Contracts.v1.Banking;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Accounting.Features.v1.Banking.IgnoreBankStatementLine;

public static class MarkBankStatementLineIgnoredEndpoint
{
    internal static RouteHandlerBuilder MapMarkBankStatementLineIgnoredEndpoint(this IEndpointRouteBuilder endpoints) =>
        endpoints.MapPost("/banking/statement-imports/lines/{lineId:guid}/ignore",
                async (Guid lineId, [FromBody] MarkBankStatementLineIgnoredBody body, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(new IgnoreBankStatementLineCommand(lineId, body.Note), ct)))
            .WithName("IgnoreBankStatementLine")
            .WithSummary("Mark a statement line as deliberately not expected in the GL")
            .RequirePermission(AccountingPermissions.Banking.Reconcile)
            .WithIdempotency();

    // Body shape: LineId comes from the route, so we only accept Note in the body.
    public sealed record MarkBankStatementLineIgnoredBody(string? Note);
}
