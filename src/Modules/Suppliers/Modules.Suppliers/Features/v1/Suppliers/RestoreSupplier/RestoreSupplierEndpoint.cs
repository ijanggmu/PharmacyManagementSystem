using FSH.Framework.Shared.Identity.Authorization;
using FSH.Framework.Web.Idempotency;
using FSH.Modules.Suppliers.Contracts.Authorization;
using FSH.Modules.Suppliers.Contracts.v1.Suppliers;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Suppliers.Features.v1.Suppliers.RestoreSupplier;

public static class RestoreSupplierEndpoint
{
    internal static RouteHandlerBuilder MapRestoreSupplierEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapPost("/suppliers/{supplierId:guid}/restore",
                async (Guid supplierId, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(new RestoreSupplierCommand(supplierId), ct)))
            .WithName("RestoreSupplier")
            .WithSummary("Restore a soft-deleted supplier")
            .RequirePermission(SuppliersPermissions.Suppliers.Restore)
            .WithIdempotency();
    }
}
