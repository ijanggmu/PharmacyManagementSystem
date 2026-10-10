using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Suppliers.Contracts.Authorization;
using FSH.Modules.Suppliers.Contracts.v1.Suppliers;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Suppliers.Features.v1.Suppliers.UpdateSupplier;

public static class UpdateSupplierEndpoint
{
    internal static RouteHandlerBuilder MapUpdateSupplierEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapPut("/suppliers/{supplierId:guid}",
                async (Guid supplierId, UpdateSupplierCommand body, IMediator mediator, CancellationToken ct) =>
                {
                    ArgumentNullException.ThrowIfNull(body);
                    var command = body with { SupplierId = supplierId };
                    return Results.Ok(await mediator.Send(command, ct));
                })
            .WithName("UpdateSupplier")
            .WithSummary("Update a supplier")
            .RequirePermission(SuppliersPermissions.Suppliers.Update);
    }
}
