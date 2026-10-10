using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Inventory.Contracts.Authorization;
using FSH.Modules.Inventory.Contracts.v1.Reports;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Inventory.Features.v1.Reports.GetExpiredBatches;

public static class GetExpiredBatchesEndpoint
{
    internal static RouteHandlerBuilder MapGetExpiredBatchesEndpoint(this IEndpointRouteBuilder endpoints) =>
        endpoints.MapGet("/reports/expired-batches",
                async (IMediator mediator, CancellationToken ct, bool? isRecalled, int? pageNumber, int? pageSize, Guid? branchId) =>
                    Results.Ok(await mediator.Send(
                        new GetExpiredBatchesQuery(
                            isRecalled,
                            pageNumber is null or 0 ? 1 : pageNumber.Value,
                            pageSize is null or 0 ? 50 : pageSize.Value,
                            branchId),
                        ct)))
            .WithName("GetExpiredBatches")
            .WithSummary("Expired, still-in-stock, not-yet-disposed batches across the tenant, paged")
            .RequirePermission(InventoryPermissions.Reports.View);
}
