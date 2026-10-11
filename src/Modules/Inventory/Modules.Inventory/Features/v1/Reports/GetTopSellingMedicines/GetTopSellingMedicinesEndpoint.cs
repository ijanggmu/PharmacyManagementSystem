using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Inventory.Contracts.Authorization;
using FSH.Modules.Inventory.Contracts.v1.Reports;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Inventory.Features.v1.Reports.GetTopSellingMedicines;

public static class GetTopSellingMedicinesEndpoint
{
    internal static RouteHandlerBuilder MapGetTopSellingMedicinesEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/reports/top-selling-medicines",
                (DateTime fromUtc, DateTime toUtc, int? take, Guid? branchId, IMediator mediator, CancellationToken ct) =>
                    mediator.Send(new GetTopSellingMedicinesQuery(fromUtc, toUtc, take ?? 10, branchId), ct))
            .WithName("GetTopSellingMedicines")
            .WithSummary("Top medicines by quantity sold over a date range, whole-period; optional branchId")
            .RequirePermission(InventoryPermissions.Reports.View);
    }
}
