using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Inventory.Contracts.Authorization;
using FSH.Modules.Inventory.Contracts.v1.Medicines;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Inventory.Features.v1.Medicines.FindDuplicateMedicines;

public static class FindDuplicateMedicinesEndpoint
{
    internal static RouteHandlerBuilder MapFindDuplicateMedicinesEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/medicines/duplicates",
                (string? name, string? strength, string? form, Guid? excludeId, IMediator mediator, CancellationToken ct) =>
                    mediator.Send(new FindDuplicateMedicinesQuery(name ?? string.Empty, strength, form, excludeId), ct))
            .WithName("FindDuplicateMedicines")
            .WithSummary("Find existing medicines with the same name, strength and form")
            .RequirePermission(InventoryPermissions.Medicines.View);
    }
}
