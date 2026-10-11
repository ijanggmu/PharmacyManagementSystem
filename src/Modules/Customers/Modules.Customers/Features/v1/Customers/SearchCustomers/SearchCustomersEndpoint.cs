using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Customers.Contracts.Authorization;
using FSH.Modules.Customers.Contracts.v1.Customers;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Customers.Features.v1.Customers.SearchCustomers;

public static class SearchCustomersEndpoint
{
    internal static RouteHandlerBuilder MapSearchCustomersEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/customers",
                (string? search, bool? isActive, int? pageNumber, int? pageSize,
                 string? sortBy, string? sortDir,
                 IMediator mediator, CancellationToken ct) =>
                    mediator.Send(
                        new SearchCustomersQuery(
                            search, isActive,
                            pageNumber is null or 0 ? 1 : pageNumber.Value,
                            pageSize is null or 0 ? 50 : pageSize.Value,
                            sortBy, sortDir),
                        ct))
            .WithName("SearchCustomers")
            .WithSummary("Search customers (paged, filter by active, sortable)")
            .RequirePermission(CustomersPermissions.Customers.View);
    }
}
