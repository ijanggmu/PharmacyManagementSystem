using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Inventory.Contracts.Authorization;
using FSH.Modules.Inventory.Contracts.v1.Medicines;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Inventory.Features.v1.Medicines.GetMedicineById;

public static class GetMedicineByIdEndpoint
{
    internal static RouteHandlerBuilder MapGetMedicineByIdEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/medicines/{medicineId:guid}",
                (Guid medicineId, IMediator mediator, CancellationToken ct) =>
                    mediator.Send(new GetMedicineByIdQuery(medicineId), ct))
            .WithName("GetMedicineById")
            .WithSummary("Get a medicine by id (with total on-hand quantity)")
            .RequirePermission(InventoryPermissions.Medicines.View);
    }
}
