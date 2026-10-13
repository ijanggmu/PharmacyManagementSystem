using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Accounting.Contracts.Authorization;
using FSH.Modules.Accounting.Contracts.v1.FixedAssets;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Accounting.Features.v1.FixedAssets.SearchDepreciationRuns;

public static class SearchDepreciationRunsEndpoint
{
    internal static RouteHandlerBuilder MapSearchDepreciationRunsEndpoint(this IEndpointRouteBuilder endpoints) =>
        endpoints.MapGet("/fixed-assets/depreciation/runs",
                async (int? fiscalYear, Guid? branchId, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(new SearchDepreciationRunsQuery(fiscalYear, branchId), ct)))
            .WithName("SearchDepreciationRuns")
            .WithSummary("Depreciation runs posted, newest first")
            .RequirePermission(AccountingPermissions.Reports.View);
}
