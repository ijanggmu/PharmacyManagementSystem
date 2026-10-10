using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Inventory.Contracts.Authorization;
using FSH.Modules.Inventory.Contracts.v1.Batches;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Inventory.Features.v1.Batches.SearchBatches;

public static class SearchBatchesEndpoint
{
    internal static RouteHandlerBuilder MapSearchBatchesEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/batches",
                (Guid? medicineId, Guid? branchId, string? search, bool? includeDisposed, DateOnly? expiringBeforeUtc,
                 int? pageNumber, int? pageSize, IMediator mediator, CancellationToken ct) =>
                    mediator.Send(
                        new SearchBatchesQuery(
                            medicineId, branchId, search, includeDisposed, expiringBeforeUtc,
                            pageNumber is null or 0 ? 1 : pageNumber.Value,
                            pageSize is null or 0 ? 50 : pageSize.Value),
                        ct))
            .WithName("SearchBatches")
            .WithSummary("Search medicine batches (paged, filter by medicine/expiry)")
            .RequirePermission(InventoryPermissions.Batches.View);
    }
}
