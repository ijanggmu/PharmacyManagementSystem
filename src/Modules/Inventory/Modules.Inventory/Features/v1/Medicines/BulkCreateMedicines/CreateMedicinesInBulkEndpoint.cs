using FSH.Framework.Shared.Identity.Authorization;
using FSH.Framework.Web.Idempotency;
using FSH.Modules.Inventory.Contracts.Authorization;
using FSH.Modules.Inventory.Contracts.v1.Medicines;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Inventory.Features.v1.Medicines.BulkCreateMedicines;

public static class CreateMedicinesInBulkEndpoint
{
    internal static RouteHandlerBuilder MapCreateMedicinesInBulkEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapPost("/medicines/bulk",
                async (BulkCreateMedicinesCommand command, IMediator mediator, CancellationToken ct) =>
                    Results.Created(string.Empty, await mediator.Send(command, ct)))
            .WithName("CreateMedicinesInBulk")
            .WithSummary("Bulk-create medicines (all-or-nothing)")
            .RequirePermission(InventoryPermissions.Medicines.Create)
            .WithIdempotency();
    }
}
