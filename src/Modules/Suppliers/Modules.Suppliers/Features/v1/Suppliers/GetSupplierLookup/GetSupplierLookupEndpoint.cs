using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Suppliers.Contracts.Authorization;
using FSH.Modules.Suppliers.Contracts.v1.Suppliers;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Suppliers.Features.v1.Suppliers.GetSupplierLookup;

public static class GetSupplierLookupEndpoint
{
    internal static RouteHandlerBuilder MapGetSupplierLookupEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/suppliers/lookup",
                (string? search, bool? includeInactive, int? limit, IMediator mediator, CancellationToken ct) =>
                    mediator.Send(
                        new GetSupplierLookupQuery(
                            search,
                            includeInactive ?? false,
                            limit is null or 0 ? GetSupplierLookupQuery.DefaultLimit : limit.Value),
                        ct))
            .WithName("GetSupplierLookup")
            .WithSummary("Supplier id/name list for pickers (active only unless includeInactive; search by name or phone)")
            .RequirePermission(SuppliersPermissions.Suppliers.View);
    }
}
