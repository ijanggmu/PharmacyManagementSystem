using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Accounting.Contracts.Authorization;
using FSH.Modules.Accounting.Contracts.v1.Banking;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Accounting.Features.v1.Banking.SearchBankStatementImports;

public static class SearchBankStatementImportsEndpoint
{
    internal static RouteHandlerBuilder MapSearchBankStatementImportsEndpoint(this IEndpointRouteBuilder endpoints) =>
        endpoints.MapGet("/banking/statement-imports",
                async ([AsParameters] SearchBankStatementImportsQuery query, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(query, ct)))
            .WithName("SearchBankStatementImports")
            .WithSummary("List bank statement imports (reconciliation sessions)")
            .RequirePermission(AccountingPermissions.Banking.View);
}
