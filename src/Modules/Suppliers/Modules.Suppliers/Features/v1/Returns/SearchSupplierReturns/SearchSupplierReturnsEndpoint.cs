using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Suppliers.Contracts.Authorization;
using FSH.Modules.Suppliers.Contracts.v1.Returns;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Suppliers.Features.v1.Returns.SearchSupplierReturns;

public static class SearchSupplierReturnsEndpoint
{
    internal static RouteHandlerBuilder MapSearchSupplierReturnsEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/suppliers/{supplierId:guid}/returns",
                (Guid supplierId, int? pageNumber, int? pageSize, Guid? branchId, IMediator mediator, CancellationToken ct) =>
                    mediator.Send(
                        new SearchSupplierReturnsQuery(
                            supplierId,
                            pageNumber is null or 0 ? 1 : pageNumber.Value,
                            pageSize is null or 0 ? 50 : pageSize.Value,
                            branchId),
                        ct))
            .WithName("SearchSupplierReturns")
            .WithSummary("List a supplier's returns (paged, newest first)")
            .RequirePermission(SuppliersPermissions.Returns.View);
    }
}
