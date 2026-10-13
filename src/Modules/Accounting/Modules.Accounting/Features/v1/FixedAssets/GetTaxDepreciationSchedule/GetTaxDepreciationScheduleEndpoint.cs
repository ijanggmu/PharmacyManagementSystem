using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Accounting.Contracts.Authorization;
using FSH.Modules.Accounting.Contracts.v1.FixedAssets;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Accounting.Features.v1.FixedAssets.GetTaxDepreciationSchedule;

public static class GetTaxDepreciationScheduleEndpoint
{
    internal static RouteHandlerBuilder MapGetTaxDepreciationScheduleEndpoint(this IEndpointRouteBuilder endpoints) =>
        endpoints.MapGet("/fixed-assets/reports/tax-depreciation",
                async (int fiscalYear, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(new GetTaxDepreciationScheduleQuery(fiscalYear), ct)))
            .WithName("GetTaxDepreciationSchedule")
            .WithSummary("Nepal tax depreciation pool schedule (Income Tax Act 2058, Schedule 2) for an income year")
            .RequirePermission(AccountingPermissions.Reports.View);
}
