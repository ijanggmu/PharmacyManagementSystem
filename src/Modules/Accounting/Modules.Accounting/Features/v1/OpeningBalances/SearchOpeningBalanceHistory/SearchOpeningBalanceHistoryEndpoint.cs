using FSH.Framework.Shared.Identity.Authorization;
using FSH.Framework.Shared.Persistence;
using FSH.Modules.Accounting.Contracts.Authorization;
using FSH.Modules.Accounting.Contracts.Dtos;
using FSH.Modules.Accounting.Contracts.v1.OpeningBalances;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Accounting.Features.v1.OpeningBalances.SearchOpeningBalanceHistory;

public static class SearchOpeningBalanceHistoryEndpoint
{
    internal static RouteHandlerBuilder MapSearchOpeningBalanceHistoryEndpoint(this IEndpointRouteBuilder endpoints) =>
        endpoints.MapGet("/opening-balances/history",
                async (Guid? branchId, int? pageNumber, int? pageSize, IMediator mediator, CancellationToken ct) =>
                    TypedResults.Ok(await mediator.Send(
                        new SearchOpeningBalanceHistoryQuery(branchId, pageNumber ?? 1, pageSize ?? 20), ct)))
            .WithName("SearchOpeningBalanceHistory")
            .WithSummary("Set / edit / reset history of opening balances, newest first")
            .Produces<PagedResponse<OpeningBalanceHistoryEntryDto>>()
            .RequirePermission(AccountingPermissions.OpeningBalances.View);
}
