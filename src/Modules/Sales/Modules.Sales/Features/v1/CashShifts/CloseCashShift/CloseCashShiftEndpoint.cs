using FSH.Framework.Shared.Identity.Authorization;
using FSH.Framework.Web.Idempotency;
using FSH.Modules.Sales.Contracts.Authorization;
using FSH.Modules.Sales.Contracts.v1.CashShifts;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Sales.Features.v1.CashShifts.CloseCashShift;

public static class CloseCashShiftEndpoint
{
    internal static RouteHandlerBuilder MapCloseCashShiftEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapPost("/cash-shifts/{cashShiftId:guid}/close",
                async (Guid cashShiftId, CloseCashShiftCommand body, IMediator mediator, CancellationToken ct) =>
                {
                    ArgumentNullException.ThrowIfNull(body);
                    var command = body with { CashShiftId = cashShiftId };
                    return Results.Ok(await mediator.Send(command, ct));
                })
            .WithName("CloseCashShift")
            .WithSummary("Close a cash shift with the counted closing cash")
            .RequirePermission(SalesPermissions.CashShifts.Close)
            .WithIdempotency();
    }
}
