using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Inventory.Contracts.Authorization;
using FSH.Modules.Inventory.Contracts.v1.Medicines;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Inventory.Features.v1.Medicines.SearchMedicines;

public static class SearchMedicinesEndpoint
{
    internal static RouteHandlerBuilder MapSearchMedicinesEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/medicines",
                (string? search, Guid? categoryId, bool? belowReorderLevel, int? pageNumber, int? pageSize,
                 Guid? supplierId, bool? includeArchived, Guid[]? categoryIds,
                 string[]? stockStatuses, string[]? expiryStatuses,
                 string? sortBy, string? sortOrder, Guid? branchId,
                 IMediator mediator, CancellationToken ct) =>
                    mediator.Send(
                        new SearchMedicinesQuery(
                            search, categoryId, belowReorderLevel,
                            pageNumber is null or 0 ? 1 : pageNumber.Value,
                            pageSize is null or 0 ? 50 : pageSize.Value,
                            supplierId, includeArchived ?? false, categoryIds, stockStatuses, expiryStatuses,
                            sortBy, sortOrder, branchId),
                        ct))
            .WithName("SearchMedicines")
            .WithSummary("Search medicines (paged; search, category, supplier, archived, stock and expiry filters)")
            .RequirePermission(InventoryPermissions.Medicines.View);
    }
}
