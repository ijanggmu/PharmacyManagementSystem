using FSH.Framework.Shared.Identity.Authorization;
using FSH.Framework.Web.Idempotency;
using FSH.Modules.Inventory.Contracts.Authorization;
using FSH.Modules.Inventory.Contracts.v1.Medicines;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Inventory.Features.v1.Medicines.AddMedicineStock;

public static class AddMedicineStockEndpoint
{
    internal static RouteHandlerBuilder MapAddMedicineStockEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapPost("/medicines/{medicineId:guid}/stock",
                async (Guid medicineId, AddMedicineStockCommand command, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(command with { MedicineId = medicineId }, ct)))
            .WithName("AddMedicineStock")
            .WithSummary("Receive a new batch of an existing medicine")
            .RequirePermission(InventoryPermissions.Batches.Create)
            .WithIdempotency();
    }
}
