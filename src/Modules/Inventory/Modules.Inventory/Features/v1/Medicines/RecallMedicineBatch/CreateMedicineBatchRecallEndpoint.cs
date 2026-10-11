using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Inventory.Contracts.Authorization;
using FSH.Modules.Inventory.Contracts.v1.Medicines;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Inventory.Features.v1.Medicines.RecallMedicineBatch;

public static class CreateMedicineBatchRecallEndpoint
{
    internal static RouteHandlerBuilder MapCreateMedicineBatchRecallEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapPost("/medicines/{medicineId:guid}/batches/recall",
                async (Guid medicineId, RecallMedicineBatchCommand body, IMediator mediator, CancellationToken ct) =>
                {
                    ArgumentNullException.ThrowIfNull(body);
                    return Results.Ok(await mediator.Send(body with { MedicineId = medicineId }, ct));
                })
            .WithName("RecallMedicineBatch")
            .WithSummary("Recall a batch (lot) across all branches so it can no longer be sold")
            .RequirePermission(InventoryPermissions.Medicines.Update);
    }
}
