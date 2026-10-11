using FSH.Framework.Shared.Identity.Authorization;
using FSH.Framework.Web.Idempotency;
using FSH.Modules.Sales.Contracts.Authorization;
using FSH.Modules.Sales.Contracts.v1.CashShifts;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Sales.Features.v1.CashShifts.StartCashShift;

public static class StartCashShiftEndpoint
{
    internal static RouteHandlerBuilder MapStartCashShiftEndpoint(this IEndpointRouteBuilder endpoints) =>
        endpoints.MapPost("/cash-shifts",
                async (StartCashShiftCommand command, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(command, ct)))
            .WithName("StartCashShift")
            .WithSummary("Open a new cash shift")
            .RequirePermission(SalesPermissions.CashShifts.Start)
            .WithIdempotency();
}
