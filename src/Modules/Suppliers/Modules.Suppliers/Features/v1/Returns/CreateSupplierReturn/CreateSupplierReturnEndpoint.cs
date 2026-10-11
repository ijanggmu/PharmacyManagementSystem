using FSH.Framework.Shared.Identity.Authorization;
using FSH.Framework.Web.Idempotency;
using FSH.Modules.Suppliers.Contracts.Authorization;
using FSH.Modules.Suppliers.Contracts.v1.Returns;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Suppliers.Features.v1.Returns.CreateSupplierReturn;

public static class CreateSupplierReturnEndpoint
{
    internal static RouteHandlerBuilder MapCreateSupplierReturnEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapPost("/suppliers/{supplierId:guid}/returns",
                async (Guid supplierId, CreateSupplierReturnCommand body, IMediator mediator, CancellationToken ct) =>
                {
                    ArgumentNullException.ThrowIfNull(body);
                    var command = body with { SupplierId = supplierId };
                    return Results.Ok(await mediator.Send(command, ct));
                })
            .WithName("CreateSupplierReturn")
            .WithSummary("Record goods returned to a supplier")
            .RequirePermission(SuppliersPermissions.Returns.Create)
            .WithIdempotency();
    }
}
