using FSH.Framework.Shared.Identity.Authorization;
using FSH.Framework.Web.Idempotency;
using FSH.Modules.Accounting.Contracts.Authorization;
using FSH.Modules.Accounting.Contracts.v1.Banking;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Accounting.Features.v1.Banking.CreateBankStatementImport;

public static class CreateBankStatementImportEndpoint
{
    internal static RouteHandlerBuilder MapCreateBankStatementImportEndpoint(this IEndpointRouteBuilder endpoints) =>
        endpoints.MapPost("/banking/statement-imports",
                async (CreateBankStatementImportCommand command, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(command, ct)))
            .WithName("CreateBankStatementImport")
            .WithSummary("Import a bank statement (lines) for reconciliation against a GL account")
            .RequirePermission(AccountingPermissions.Banking.Reconcile)
            .WithIdempotency();
}
