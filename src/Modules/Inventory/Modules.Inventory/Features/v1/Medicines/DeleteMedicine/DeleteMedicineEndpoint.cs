using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Inventory.Contracts.Authorization;
using FSH.Modules.Inventory.Contracts.v1.Medicines;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Inventory.Features.v1.Medicines.DeleteMedicine;

public static class DeleteMedicineEndpoint
{
    internal static RouteHandlerBuilder MapDeleteMedicineEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapDelete("/medicines/{medicineId:guid}",
                async (Guid medicineId, IMediator mediator, CancellationToken ct) =>
                {
                    await mediator.Send(new DeleteMedicineCommand(medicineId), ct);
                    return Results.NoContent();
                })
            .WithName("DeleteMedicine")
            .WithSummary("Delete (archive) a medicine")
            .RequirePermission(InventoryPermissions.Medicines.Delete);
    }
}
