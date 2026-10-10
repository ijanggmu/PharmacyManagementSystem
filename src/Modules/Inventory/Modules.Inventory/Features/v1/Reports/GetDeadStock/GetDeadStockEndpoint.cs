using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Inventory.Contracts.Authorization;
using FSH.Modules.Inventory.Contracts.v1.Reports;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Inventory.Features.v1.Reports.GetDeadStock;

public static class GetDeadStockEndpoint
{
    internal static RouteHandlerBuilder MapGetDeadStockEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/reports/dead-stock",
                (int? sinceDays, int? pageNumber, int? pageSize, Guid? branchId, IMediator mediator, CancellationToken ct) =>
                    mediator.Send(
                        new GetDeadStockQuery(
                            sinceDays ?? 90,
                            pageNumber is null or 0 ? 1 : pageNumber.Value,
                            pageSize is null or 0 ? 50 : pageSize.Value,
                            branchId),
                        ct))
            .WithName("GetDeadStock")
            .WithSummary("Medicines in stock with no sale in N days (default 90), paged")
            .RequirePermission(InventoryPermissions.Reports.View);
    }
}
