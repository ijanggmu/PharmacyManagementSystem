using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Accounting.Contracts.Authorization;
using FSH.Modules.Accounting.Contracts.v1.Banking;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Accounting.Features.v1.Banking.SearchBankDeposits;

public static class SearchBankDepositsEndpoint
{
    internal static RouteHandlerBuilder MapSearchBankDepositsEndpoint(this IEndpointRouteBuilder endpoints) =>
        endpoints.MapGet("/banking/deposits",
                async ([AsParameters] SearchBankDepositsQuery query, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(query, ct)))
            .WithName("SearchBankDeposits")
            .WithSummary("Search bank deposits")
            .RequirePermission(AccountingPermissions.Banking.View);
}
