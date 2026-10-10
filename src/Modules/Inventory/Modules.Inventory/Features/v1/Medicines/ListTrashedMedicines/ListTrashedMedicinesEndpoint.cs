using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Inventory.Contracts.Authorization;
using FSH.Modules.Inventory.Contracts.v1.Medicines;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Inventory.Features.v1.Medicines.ListTrashedMedicines;

public static class ListTrashedMedicinesEndpoint
{
    internal static RouteHandlerBuilder MapListTrashedMedicinesEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/medicines/trash",
                async (int? pageNumber, int? pageSize, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(
                        new ListTrashedMedicinesQuery(pageNumber ?? 1, pageSize ?? 20), ct)))
            .WithName("ListTrashedMedicines")
            .WithSummary("List archived (soft-deleted) medicines")
            .RequirePermission(InventoryPermissions.Medicines.Restore);
    }
}
