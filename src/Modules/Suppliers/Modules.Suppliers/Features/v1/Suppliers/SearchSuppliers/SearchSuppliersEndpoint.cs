using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Suppliers.Contracts.Authorization;
using FSH.Modules.Suppliers.Contracts.v1.Suppliers;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Suppliers.Features.v1.Suppliers.SearchSuppliers;

public static class SearchSuppliersEndpoint
{
    internal static RouteHandlerBuilder MapSearchSuppliersEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/suppliers",
                (string? search, bool? isActive, int? pageNumber, int? pageSize,
                 string? sortBy, string? sortDir, bool? isComplete,
                 IMediator mediator, CancellationToken ct) =>
                    mediator.Send(
                        new SearchSuppliersQuery(
                            search, isActive,
                            pageNumber is null or 0 ? 1 : pageNumber.Value,
                            pageSize is null or 0 ? 50 : pageSize.Value,
                            sortBy, sortDir, isComplete),
                        ct))
            .WithName("SearchSuppliers")
            .WithSummary("Search suppliers (paged, filter by active and contact-profile completeness, sortable)")
            .RequirePermission(SuppliersPermissions.Suppliers.View);
    }
}
