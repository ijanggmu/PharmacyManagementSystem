using FSH.Framework.Shared.Identity.Authorization;
using FSH.Framework.Web.Idempotency;
using FSH.Modules.Accounting.Contracts.Authorization;
using FSH.Modules.Accounting.Contracts.v1.Banking;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Accounting.Features.v1.Banking.CompleteBankStatementImport;

public static class FinalizeBankStatementImportEndpoint
{
    internal static RouteHandlerBuilder MapFinalizeBankStatementImportEndpoint(this IEndpointRouteBuilder endpoints) =>
        endpoints.MapPost("/banking/statement-imports/{importId:guid}/complete",
                async (Guid importId, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(new CompleteBankStatementImportCommand(importId), ct)))
            .WithName("CompleteBankStatementImport")
            .WithSummary("Lock a fully-matched statement as reconciled")
            .RequirePermission(AccountingPermissions.Banking.Reconcile)
            .WithIdempotency();
}
