using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Sales.Contracts.Authorization;
using FSH.Modules.Sales.Contracts.v1.CashShifts;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Sales.Features.v1.CashShifts.GetCashShiftSummary;

public static class GetCashShiftSummaryEndpoint
{
    internal static RouteHandlerBuilder MapGetCashShiftSummaryEndpoint(this IEndpointRouteBuilder endpoints) =>
        endpoints.MapGet("/cash-shifts/{cashShiftId:guid}/summary",
                async (Guid cashShiftId, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(new GetCashShiftSummaryQuery(cashShiftId), ct)))
            .WithName("GetCashShiftSummary")
            .WithSummary("Reconcile a cash shift's expected vs. counted cash")
            .RequirePermission(SalesPermissions.CashShifts.View);
}
