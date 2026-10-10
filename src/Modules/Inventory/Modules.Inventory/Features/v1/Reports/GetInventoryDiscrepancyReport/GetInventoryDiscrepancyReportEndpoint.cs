using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Inventory.Contracts.Authorization;
using FSH.Modules.Inventory.Contracts.v1.Reports;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Inventory.Features.v1.Reports.GetInventoryDiscrepancyReport;

public static class GetInventoryDiscrepancyReportEndpoint
{
    internal static RouteHandlerBuilder MapGetInventoryDiscrepancyReportEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/reports/inventory-discrepancy",
                (IMediator mediator, CancellationToken ct) =>
                    mediator.Send(new GetInventoryDiscrepancyReportQuery(), ct))
            .WithName("GetInventoryDiscrepancyReport")
            .WithSummary("Compliance report — medicines currently below their reorder level")
            .RequirePermission(InventoryPermissions.Reports.View);
    }
}
