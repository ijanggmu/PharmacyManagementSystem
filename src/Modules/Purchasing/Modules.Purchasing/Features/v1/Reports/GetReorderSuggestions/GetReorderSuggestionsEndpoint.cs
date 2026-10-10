using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Inventory.Contracts.Authorization;
using FSH.Modules.Purchasing.Contracts.v1.Reports;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Purchasing.Features.v1.Reports.GetReorderSuggestions;

/// <summary>
/// GET api/v1/purchasing/reorder-suggestions: the legacy app/api/purchases/reorder-suggestions contract,
/// returning per-medicine supplier, unit cost, stock, sales velocity and reason. Keeps the Inventory
/// reports-view permission, matching the legacy inventory:read gate.
/// </summary>
public static class GetReorderSuggestionsEndpoint
{
    internal static RouteHandlerBuilder MapGetReorderSuggestionsEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/reorder-suggestions",
                (IMediator mediator, CancellationToken ct) =>
                    mediator.Send(new GetPurchasingReorderSuggestionsQuery(), ct))
            .WithName("GetPurchasingReorderSuggestions")
            .WithSummary("Medicines to reorder from their supplier, with stock, unit cost, sales velocity and reason")
            .RequirePermission(InventoryPermissions.Reports.View);
    }
}
