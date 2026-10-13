using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Accounting.Contracts.Authorization;
using FSH.Modules.Accounting.Contracts.v1.FixedAssets;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Accounting.Features.v1.FixedAssets.SearchFixedAssets;

public static class SearchFixedAssetsEndpoint
{
    internal static RouteHandlerBuilder MapSearchFixedAssetsEndpoint(this IEndpointRouteBuilder endpoints) =>
        endpoints.MapGet("/fixed-assets",
                async (string? status, Guid? branchId, string? search, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(new SearchFixedAssetsQuery(status, branchId, search), ct)))
            .WithName("SearchFixedAssets")
            .WithSummary("The fixed asset register with cost, accumulated depreciation and net book value")
            .RequirePermission(AccountingPermissions.Reports.View);
}
