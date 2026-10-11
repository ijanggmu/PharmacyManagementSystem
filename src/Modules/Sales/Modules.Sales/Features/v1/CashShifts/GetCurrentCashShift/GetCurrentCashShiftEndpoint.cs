using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Sales.Contracts.Authorization;
using FSH.Modules.Sales.Contracts.v1.CashShifts;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Sales.Features.v1.CashShifts.GetCurrentCashShift;

public static class GetCurrentCashShiftEndpoint
{
    internal static RouteHandlerBuilder MapGetCurrentCashShiftEndpoint(this IEndpointRouteBuilder endpoints) =>
        endpoints.MapGet("/cash-shifts/current",
                async (IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(new GetCurrentCashShiftQuery(), ct)))
            .WithName("GetCurrentCashShift")
            .WithSummary("Get the currently open cash shift")
            .RequirePermission(SalesPermissions.CashShifts.View);
}
