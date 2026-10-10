using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Inventory.Contracts.Authorization;
using FSH.Modules.Inventory.Contracts.v1.Reports;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Inventory.Features.v1.Reports.GetCategoryPerformance;

public static class GetCategoryPerformanceEndpoint
{
    internal static RouteHandlerBuilder MapGetCategoryPerformanceEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/reports/category-performance",
                (DateTime fromUtc, DateTime toUtc, Guid? branchId, IMediator mediator, CancellationToken ct) =>
                    mediator.Send(new GetCategoryPerformanceQuery(fromUtc, toUtc, branchId), ct))
            .WithName("GetCategoryPerformance")
            .WithSummary("Quantity/revenue by medicine category over a date range, whole-period; optional branchId")
            .RequirePermission(InventoryPermissions.Reports.View);
    }
}
