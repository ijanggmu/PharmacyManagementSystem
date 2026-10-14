using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Customers.Contracts.Authorization;
using FSH.Modules.Customers.Contracts.v1.Customers;
using FSH.Modules.Customers.Services;
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
                async (string? search, bool? isActive, int? pageNumber, int? pageSize,
                 string? sortBy, string? sortDir, bool? orHasBalance,
                 IMediator mediator, ICustomerFinancialsAccess financials, CancellationToken ct) =>
                {
                    var page = await mediator.Send(
                        new SearchCustomersQuery(
                            search, isActive,
                            pageNumber is null or 0 ? 1 : pageNumber.Value,
                            pageSize is null or 0 ? 50 : pageSize.Value,
                            sortBy, sortDir, orHasBalance ?? false),
                        ct);
                    // Lookup without money for callers who can't view the customer ledger.
                    return CustomerFinancialsRedaction.Apply(page, await financials.CanViewAsync(ct));
                })
            .WithName("SearchCustomers")
            .WithSummary("Search customers (paged, filter by active, sortable)")
            .RequirePermission(CustomersPermissions.Customers.View);
    }
}
