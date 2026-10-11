using FSH.Framework.Shared.Identity.Authorization;
using FSH.Framework.Web.Idempotency;
using FSH.Modules.Accounting.Contracts.Authorization;
using FSH.Modules.Accounting.Contracts.v1.Banking;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Accounting.Features.v1.Banking.AutoMatchBankStatementImport;

public static class GenerateBankStatementMatchesEndpoint
{
    internal static RouteHandlerBuilder MapGenerateBankStatementMatchesEndpoint(this IEndpointRouteBuilder endpoints) =>
        endpoints.MapPost("/banking/statement-imports/{importId:guid}/auto-match",
                async (Guid importId, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(new AutoMatchBankStatementImportCommand(importId), ct)))
            .WithName("AutoMatchBankStatementImport")
            .WithSummary("Auto-match statement lines to GL entries by amount, direction, and near date")
            .RequirePermission(AccountingPermissions.Banking.Reconcile)
            .WithIdempotency();
}
