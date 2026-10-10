using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Inventory.Contracts.Authorization;
using FSH.Modules.Inventory.Contracts.v1.Reports;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Inventory.Features.v1.Reports.GetExpiringBatches;

public static class GetExpiringBatchesEndpoint
{
    internal static RouteHandlerBuilder MapGetExpiringBatchesEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/reports/expiring-batches",
                (int? withinDays, Guid? branchId, IMediator mediator, CancellationToken ct) =>
                    mediator.Send(new GetExpiringBatchesQuery(withinDays ?? 90, branchId), ct))
            .WithName("GetExpiringBatches")
            .WithSummary("Non-disposed batches expiring within N days (default 90)")
            .RequirePermission(InventoryPermissions.Reports.View);
    }
}
