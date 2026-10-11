using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Sales.Contracts.Authorization;
using FSH.Modules.Sales.Contracts.v1.CashShifts;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Sales.Features.v1.CashShifts.GetCashShiftById;

public static class GetCashShiftByIdEndpoint
{
    internal static RouteHandlerBuilder MapGetCashShiftByIdEndpoint(this IEndpointRouteBuilder endpoints) =>
        endpoints.MapGet("/cash-shifts/{cashShiftId:guid}",
                async (Guid cashShiftId, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(new GetCashShiftByIdQuery(cashShiftId), ct)))
            .WithName("GetCashShiftById")
            .WithSummary("Get a cash shift by id")
            .RequirePermission(SalesPermissions.CashShifts.View);
}
