using FSH.Framework.Shared.Identity.Authorization;
using FSH.Framework.Web.Idempotency;
using FSH.Modules.Suppliers.Contracts.Authorization;
using FSH.Modules.Suppliers.Contracts.v1.Suppliers;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Suppliers.Features.v1.Suppliers.CreateSupplier;

public static class CreateSupplierEndpoint
{
    internal static RouteHandlerBuilder MapCreateSupplierEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapPost("/suppliers",
                async (CreateSupplierCommand command, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(command, ct)))
            .WithName("CreateSupplier")
            .WithSummary("Create a supplier")
            .RequirePermission(SuppliersPermissions.Suppliers.Create)
            .WithIdempotency();
    }
}
