using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Inventory.Contracts.Authorization;
using FSH.Modules.Inventory.Contracts.v1.Medicines;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Inventory.Features.v1.Medicines.PriceHistory;

public static class GetMedicinePriceHistoryEndpoint
{
    internal static RouteHandlerBuilder MapGetMedicinePriceHistoryEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/medicines/{medicineId:guid}/price-history",
                (Guid medicineId, IMediator mediator, CancellationToken ct) =>
                    mediator.Send(new GetMedicinePriceHistoryQuery(medicineId), ct))
            .WithName("GetMedicinePriceHistory")
            .WithSummary("List a medicine's price-list history")
            .RequirePermission(InventoryPermissions.Medicines.View);
    }
}
