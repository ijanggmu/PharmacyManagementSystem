using FSH.Framework.Shared.Identity.Authorization;
using FSH.Framework.Web.Idempotency;
using FSH.Modules.Inventory.Contracts.Authorization;
using FSH.Modules.Inventory.Contracts.v1.Medicines;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Inventory.Features.v1.Medicines.CreateMedicine;

public static class CreateMedicineEndpoint
{
    internal static RouteHandlerBuilder MapCreateMedicineEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapPost("/medicines",
                async (CreateMedicineCommand command, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(command, ct)))
            .WithName("CreateMedicine")
            .WithSummary("Create a medicine")
            .RequirePermission(InventoryPermissions.Medicines.Create)
            .WithIdempotency();
    }
}
