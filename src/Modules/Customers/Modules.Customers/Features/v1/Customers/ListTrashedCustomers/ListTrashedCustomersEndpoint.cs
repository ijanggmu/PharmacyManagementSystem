using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Customers.Contracts.Authorization;
using FSH.Modules.Customers.Contracts.v1.Customers;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Customers.Features.v1.Customers.ListTrashedCustomers;

public static class ListTrashedCustomersEndpoint
{
    internal static RouteHandlerBuilder MapListTrashedCustomersEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/customers/trash",
                async (int? pageNumber, int? pageSize, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(
                        new ListTrashedCustomersQuery(pageNumber ?? 1, pageSize ?? 20), ct)))
            .WithName("ListTrashedCustomers")
            .WithSummary("List soft-deleted customers")
            .RequirePermission(CustomersPermissions.Customers.Restore);
    }
}
