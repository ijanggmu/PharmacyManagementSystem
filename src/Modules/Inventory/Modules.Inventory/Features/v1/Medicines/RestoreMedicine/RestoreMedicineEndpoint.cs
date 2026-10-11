using FSH.Framework.Shared.Identity.Authorization;
using FSH.Framework.Web.Idempotency;
using FSH.Modules.Inventory.Contracts.Authorization;
using FSH.Modules.Inventory.Contracts.v1.Medicines;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Inventory.Features.v1.Medicines.RestoreMedicine;

public static class RestoreMedicineEndpoint
{
    internal static RouteHandlerBuilder MapRestoreMedicineEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapPost("/medicines/{medicineId:guid}/restore",
                async (Guid medicineId, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(new RestoreMedicineCommand(medicineId), ct)))
            .WithName("RestoreMedicine")
            .WithSummary("Restore an archived medicine")
            .RequirePermission(InventoryPermissions.Medicines.Restore)
            .WithIdempotency();
    }
}
