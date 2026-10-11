using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Inventory.Contracts.Authorization;
using FSH.Modules.Inventory.Contracts.v1.Medicines;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Inventory.Features.v1.Medicines.UpdateMedicine;

public static class UpdateMedicineEndpoint
{
    internal static RouteHandlerBuilder MapUpdateMedicineEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapPut("/medicines/{medicineId:guid}",
                async (Guid medicineId, UpdateMedicineCommand body, IMediator mediator, CancellationToken ct) =>
                {
                    ArgumentNullException.ThrowIfNull(body);
                    var command = body with { MedicineId = medicineId };
                    return Results.Ok(await mediator.Send(command, ct));
                })
            .WithName("UpdateMedicine")
            .WithSummary("Update a medicine")
            .RequirePermission(InventoryPermissions.Medicines.Update);
    }
}
