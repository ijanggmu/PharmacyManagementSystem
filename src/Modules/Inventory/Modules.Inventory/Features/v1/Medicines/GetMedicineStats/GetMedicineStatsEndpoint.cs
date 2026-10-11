using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Inventory.Contracts.Authorization;
using FSH.Modules.Inventory.Contracts.v1.Medicines;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Inventory.Features.v1.Medicines.GetMedicineStats;

public static class GetMedicineStatsEndpoint
{
    internal static RouteHandlerBuilder MapGetMedicineStatsEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/medicines/stats",
                (Guid? branchId, IMediator mediator, CancellationToken ct) =>
                    mediator.Send(new GetMedicineStatsQuery(branchId), ct))
            .WithName("GetMedicineStats")
            .WithSummary("Medicine stat-card counts (optional branchId; confined for single-branch users)")
            .RequirePermission(InventoryPermissions.Medicines.View);
    }
}
