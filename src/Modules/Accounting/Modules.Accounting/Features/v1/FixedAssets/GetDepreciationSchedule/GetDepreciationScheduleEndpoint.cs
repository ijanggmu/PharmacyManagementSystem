using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Accounting.Contracts.Authorization;
using FSH.Modules.Accounting.Contracts.v1.FixedAssets;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Accounting.Features.v1.FixedAssets.GetDepreciationSchedule;

public static class GetDepreciationScheduleEndpoint
{
    internal static RouteHandlerBuilder MapGetDepreciationScheduleEndpoint(this IEndpointRouteBuilder endpoints) =>
        endpoints.MapGet("/fixed-assets/reports/depreciation-schedule",
                async (int fiscalYear, Guid? branchId, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(new GetDepreciationScheduleQuery(fiscalYear, branchId), ct)))
            .WithName("GetDepreciationSchedule")
            .WithSummary("Book depreciation schedule of a fiscal year (per asset, per month)")
            .RequirePermission(AccountingPermissions.Reports.View);
}
