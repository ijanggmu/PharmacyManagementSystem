using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Inventory.Contracts.Authorization;
using FSH.Modules.Inventory.Contracts.v1.Medicines;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Inventory.Features.v1.Medicines.GenerateMedicineBarcode;

public static class GenerateMedicineBarcodeEndpoint
{
    internal static RouteHandlerBuilder MapGenerateMedicineBarcodeEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/medicines/barcodes/new",
                (IMediator mediator, CancellationToken ct) => mediator.Send(new GenerateMedicineBarcodeQuery(), ct))
            .WithName("GenerateMedicineBarcode")
            .WithSummary("Propose an unused in-store EAN-13 barcode for a medicine")
            .RequirePermission(InventoryPermissions.Medicines.Update);
    }
}
