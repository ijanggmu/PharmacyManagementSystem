using FSH.Framework.Shared.Identity.Authorization;
using FSH.Framework.Web.Idempotency;
using FSH.Modules.Inventory.Contracts.Authorization;
using FSH.Modules.Inventory.Contracts.v1.Medicines;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Inventory.Features.v1.Medicines.PriceHistory;

public static class CreateMedicinePriceScheduleEndpoint
{
    internal static RouteHandlerBuilder MapCreateMedicinePriceScheduleEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapPost("/medicines/{medicineId:guid}/price-history",
                async (Guid medicineId, CreateMedicinePriceScheduleRequest request, IMediator mediator, CancellationToken ct) =>
                {
                    var command = new CreateMedicinePriceScheduleCommand(
                        medicineId, request.UnitPrice, request.EffectiveFrom, request.CostPrice, request.Reason);
                    var id = await mediator.Send(command, ct).ConfigureAwait(false);
                    return Results.Created(string.Empty, id);
                })
            .WithName("CreateMedicinePriceSchedule")
            .WithSummary("Change a medicine's price now, or schedule a future price change")
            .RequirePermission(InventoryPermissions.Medicines.Update)
            .WithIdempotency();
    }
}

/// <summary>Request body — <c>MedicineId</c> comes from the route, not the body.</summary>
public sealed record CreateMedicinePriceScheduleRequest(
    decimal UnitPrice,
    DateOnly EffectiveFrom,
    decimal? CostPrice = null,
    string? Reason = null);
