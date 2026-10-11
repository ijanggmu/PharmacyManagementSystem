using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Accounting.Contracts.Authorization;
using FSH.Modules.Accounting.Contracts.v1.Banking;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Accounting.Features.v1.Banking.SearchBankReconciliations;

public static class SearchBankReconciliationsEndpoint
{
    internal static RouteHandlerBuilder MapSearchBankReconciliationsEndpoint(this IEndpointRouteBuilder endpoints) =>
        endpoints.MapGet("/banking/reconciliations",
                async ([AsParameters] SearchBankReconciliationsQuery query, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(query, ct)))
            .WithName("SearchBankReconciliations")
            .WithSummary("Search bank reconciliations")
            .RequirePermission(AccountingPermissions.Banking.View);
}
