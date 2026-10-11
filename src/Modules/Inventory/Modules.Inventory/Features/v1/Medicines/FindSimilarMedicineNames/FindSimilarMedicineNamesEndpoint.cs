using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Inventory.Contracts.Authorization;
using FSH.Modules.Inventory.Contracts.v1.Medicines;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Inventory.Features.v1.Medicines.FindSimilarMedicineNames;

public static class FindSimilarMedicineNamesEndpoint
{
    internal static RouteHandlerBuilder MapFindSimilarMedicineNamesEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/medicines/similar-names",
                (string? name, Guid? excludeId, IMediator mediator, CancellationToken ct) =>
                    mediator.Send(new FindSimilarMedicineNamesQuery(name ?? string.Empty, excludeId), ct))
            .WithName("FindSimilarMedicineNames")
            .WithSummary("Find existing medicine names similar to the given name (LASA check)")
            .RequirePermission(InventoryPermissions.Medicines.View);
    }
}
