using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Suppliers.Contracts.Authorization;
using FSH.Modules.Suppliers.Contracts.v1.CostHistory;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Suppliers.Features.v1.CostHistory.GetSupplierCostHistory;

public static class GetSupplierCostHistoryEndpoint
{
    internal static RouteHandlerBuilder MapGetSupplierCostHistoryEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/suppliers/{supplierId:guid}/cost-history",
                (Guid supplierId, int? limit, IMediator mediator, CancellationToken ct) =>
                    mediator.Send(new GetSupplierCostHistoryQuery(supplierId, limit is null or <= 0 ? 200 : limit.Value), ct))
            .WithName("GetSupplierCostHistory")
            .WithSummary("Get a supplier's historical unit cost per medicine over time")
            .RequirePermission(SuppliersPermissions.Ledger.View);
    }
}
