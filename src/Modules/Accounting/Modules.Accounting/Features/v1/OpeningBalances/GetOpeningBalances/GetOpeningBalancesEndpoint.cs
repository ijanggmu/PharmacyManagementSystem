using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Accounting.Contracts.Authorization;
using FSH.Modules.Accounting.Contracts.Dtos;
using FSH.Modules.Accounting.Contracts.v1.OpeningBalances;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Accounting.Features.v1.OpeningBalances.GetOpeningBalances;

public static class GetOpeningBalancesEndpoint
{
    internal static RouteHandlerBuilder MapGetOpeningBalancesEndpoint(this IEndpointRouteBuilder endpoints) =>
        endpoints.MapGet("/opening-balances",
                async (Guid? branchId, IMediator mediator, CancellationToken ct) =>
                    TypedResults.Ok(await mediator.Send(new GetOpeningBalancesQuery(branchId), ct)))
            .WithName("GetOpeningBalances")
            .WithSummary("Active opening balances of a branch")
            .Produces<OpeningBalanceStateDto>()
            .RequirePermission(AccountingPermissions.OpeningBalances.View);
}
