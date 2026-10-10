using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Inventory.Contracts.Authorization;
using FSH.Modules.Inventory.Contracts.v1.MedicineCatalog;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Inventory.Features.v1.MedicineCatalog.SearchNepalMedicineCatalog;

public static class SearchNepalMedicineCatalogEndpoint
{
    internal static RouteHandlerBuilder MapSearchNepalMedicineCatalogEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/medicine-catalog/nepal",
                (string? q, int? limit, IMediator mediator, CancellationToken ct) =>
                    mediator.Send(new SearchNepalMedicineCatalogQuery(q, limit ?? 10), ct))
            .WithName("SearchNepalMedicineCatalog")
            .WithSummary("Search the shared Nepal medicine reference catalog")
            .RequirePermission(InventoryPermissions.Medicines.View);
    }
}
