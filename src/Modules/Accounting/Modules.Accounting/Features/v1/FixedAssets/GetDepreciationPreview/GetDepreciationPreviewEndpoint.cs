using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Accounting.Contracts.Authorization;
using FSH.Modules.Accounting.Contracts.v1.FixedAssets;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Accounting.Features.v1.FixedAssets.GetDepreciationPreview;

public static class GetDepreciationPreviewEndpoint
{
    internal static RouteHandlerBuilder MapGetDepreciationPreviewEndpoint(this IEndpointRouteBuilder endpoints) =>
        endpoints.MapGet("/fixed-assets/depreciation/preview",
                async (int fiscalYear, int? month, Guid? branchId, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(new GetDepreciationPreviewQuery(fiscalYear, month, branchId), ct)))
            .WithName("GetDepreciationPreview")
            .WithSummary("Preview a depreciation run for a fiscal month or year (nothing is posted)")
            .RequirePermission(AccountingPermissions.Reports.View);
}
