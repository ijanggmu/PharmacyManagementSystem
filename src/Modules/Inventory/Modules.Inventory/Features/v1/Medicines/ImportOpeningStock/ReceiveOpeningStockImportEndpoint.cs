using FSH.Framework.Shared.Identity.Authorization;
using FSH.Framework.Web.Idempotency;
using FSH.Modules.Inventory.Contracts.Authorization;
using FSH.Modules.Inventory.Contracts.v1.Medicines;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Inventory.Features.v1.Medicines.ImportOpeningStock;

public static class ReceiveOpeningStockImportEndpoint
{
    internal static RouteHandlerBuilder MapReceiveOpeningStockImportEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapPost("/medicines/stock/import",
                async (ImportOpeningStockCommand command, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(command, ct)))
            .WithName("ImportOpeningStock")
            .WithSummary("Receive stock for existing medicines from a spreadsheet (all-or-nothing; dryRun previews)")
            .RequirePermission(InventoryPermissions.Batches.Create)
            .WithIdempotency();
    }
}
