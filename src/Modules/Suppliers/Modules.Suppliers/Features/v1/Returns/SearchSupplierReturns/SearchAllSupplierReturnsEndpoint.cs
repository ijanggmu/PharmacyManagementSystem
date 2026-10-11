using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Suppliers.Contracts.Authorization;
using FSH.Modules.Suppliers.Contracts.v1.Returns;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Suppliers.Features.v1.Returns.SearchSupplierReturns;

public static class SearchAllSupplierReturnsEndpoint
{
    internal static RouteHandlerBuilder MapSearchAllSupplierReturnsEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/suppliers/returns",
                (Guid? supplierId, int? pageNumber, int? pageSize, Guid? branchId, IMediator mediator, CancellationToken ct) =>
                    mediator.Send(new SearchSupplierReturnsQuery(supplierId, pageNumber ?? 1, pageSize ?? 50, branchId), ct))
            .WithName("SearchAllSupplierReturns")
            .WithSummary("Debit notes (returns to suppliers) across all suppliers, newest first")
            .RequirePermission(SuppliersPermissions.Returns.View);
    }
}
