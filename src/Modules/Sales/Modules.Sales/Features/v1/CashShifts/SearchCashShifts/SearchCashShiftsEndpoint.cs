using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Sales.Contracts.Authorization;
using FSH.Modules.Sales.Contracts.v1.CashShifts;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Sales.Features.v1.CashShifts.SearchCashShifts;

public static class SearchCashShiftsEndpoint
{
    internal static RouteHandlerBuilder MapSearchCashShiftsEndpoint(this IEndpointRouteBuilder endpoints) =>
        endpoints.MapGet("/cash-shifts",
                async ([AsParameters] SearchCashShiftsQuery query, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(query, ct)))
            .WithName("SearchCashShifts")
            .WithSummary("Search cash shifts")
            .RequirePermission(SalesPermissions.CashShifts.View);
}
