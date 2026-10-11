using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Suppliers.Contracts.Authorization;
using FSH.Modules.Suppliers.Contracts.v1.Suppliers;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Suppliers.Features.v1.Suppliers.ListTrashedSuppliers;

public static class ListTrashedSuppliersEndpoint
{
    internal static RouteHandlerBuilder MapListTrashedSuppliersEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/suppliers/trash",
                async (int? pageNumber, int? pageSize, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(
                        new ListTrashedSuppliersQuery(pageNumber ?? 1, pageSize ?? 20), ct)))
            .WithName("ListTrashedSuppliers")
            .WithSummary("List soft-deleted suppliers")
            .RequirePermission(SuppliersPermissions.Suppliers.Restore);
    }
}
