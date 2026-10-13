using FSH.Framework.Shared.Identity.Authorization;
using FSH.Framework.Web.Idempotency;
using FSH.Modules.Suppliers.Contracts.Authorization;
using FSH.Modules.Suppliers.Contracts.v1.Suppliers;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Suppliers.Features.v1.Suppliers.ImportSuppliers;

public static class CreateSupplierImportEndpoint
{
    internal static RouteHandlerBuilder MapCreateSupplierImportEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapPost("/suppliers/import",
                async (ImportSuppliersCommand command, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(command, ct)))
            .WithName("ImportSuppliers")
            .WithSummary("Import suppliers from a spreadsheet (all-or-nothing; dryRun previews)")
            .RequirePermission(SuppliersPermissions.Suppliers.Create)
            .WithIdempotency();
    }
}
