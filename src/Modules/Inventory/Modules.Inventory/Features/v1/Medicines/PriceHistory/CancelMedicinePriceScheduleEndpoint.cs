using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Inventory.Contracts.Authorization;
using FSH.Modules.Inventory.Contracts.v1.Medicines;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Inventory.Features.v1.Medicines.PriceHistory;

public static class CancelMedicinePriceScheduleEndpoint
{
    internal static RouteHandlerBuilder MapCancelMedicinePriceScheduleEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapDelete("/medicines/{medicineId:guid}/price-history/{historyId:guid}",
                async (Guid medicineId, Guid historyId, IMediator mediator, CancellationToken ct) =>
                {
                    await mediator.Send(new CancelMedicinePriceScheduleCommand(medicineId, historyId), ct)
                        .ConfigureAwait(false);
                    return Results.NoContent();
                })
            .WithName("CancelMedicinePriceSchedule")
            .WithSummary("Cancel a pending scheduled price change")
            .RequirePermission(InventoryPermissions.Medicines.Update);
    }
}
