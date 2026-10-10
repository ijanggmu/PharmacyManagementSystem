using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Accounting.Contracts.Authorization;
using FSH.Modules.Accounting.Contracts.v1.Reports;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Accounting.Features.v1.Reports.GetInventoryGlReconciliation;

public static class GetInventoryGlReconciliationEndpoint
{
    internal static RouteHandlerBuilder MapGetInventoryGlReconciliationEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/reports/inventory-gl-reconciliation",
                (Guid? branchId, IMediator mediator, CancellationToken ct) =>
                    mediator.Send(new GetInventoryGlReconciliationQuery(branchId), ct))
            .WithName("GetInventoryGlReconciliation")
            .WithSummary("Compare Inventory's stock valuation against the Inventory GL account, per branch or all")
            .RequirePermission(AccountingPermissions.Reports.View);
    }
}
