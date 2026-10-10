using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Suppliers.Contracts.Authorization;
using FSH.Modules.Suppliers.Contracts.v1.Suppliers;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Suppliers.Features.v1.Suppliers.DeleteSupplier;

public static class DeleteSupplierEndpoint
{
    internal static RouteHandlerBuilder MapDeleteSupplierEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapDelete("/suppliers/{supplierId:guid}",
                async (Guid supplierId, IMediator mediator, CancellationToken ct) =>
                {
                    await mediator.Send(new DeleteSupplierCommand(supplierId), ct);
                    return Results.NoContent();
                })
            .WithName("DeleteSupplier")
            .WithSummary("Delete a supplier")
            .RequirePermission(SuppliersPermissions.Suppliers.Delete);
    }
}
