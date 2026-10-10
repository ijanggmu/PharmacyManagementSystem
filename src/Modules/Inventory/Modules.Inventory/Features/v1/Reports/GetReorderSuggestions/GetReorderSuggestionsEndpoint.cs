using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Inventory.Contracts.Authorization;
using FSH.Modules.Inventory.Contracts.v1.Reports;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Inventory.Features.v1.Reports.GetReorderSuggestions;

public static class GetReorderSuggestionsEndpoint
{
    internal static RouteHandlerBuilder MapGetReorderSuggestionsEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/reports/reorder-suggestions",
                (Guid? branchId, IMediator mediator, CancellationToken ct) =>
                    mediator.Send(new GetReorderSuggestionsQuery(branchId), ct))
            .WithName("GetReorderSuggestions")
            .WithSummary("Medicines at or below their reorder level")
            .RequirePermission(InventoryPermissions.Reports.View);
    }
}
