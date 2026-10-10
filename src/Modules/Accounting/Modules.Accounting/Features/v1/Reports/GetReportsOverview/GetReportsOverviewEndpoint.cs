using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Accounting.Contracts.Authorization;
using FSH.Modules.Accounting.Contracts.v1.Reports;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Accounting.Features.v1.Reports.GetReportsOverview;

public static class GetReportsOverviewEndpoint
{
    internal static RouteHandlerBuilder MapGetReportsOverviewEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/reports/overview",
                (DateTime fromUtc, DateTime toUtc, Guid? branchId, IMediator mediator, CancellationToken ct) =>
                    mediator.Send(new GetReportsOverviewQuery(fromUtc, toUtc, branchId), ct))
            .WithName("GetReportsOverview")
            .WithSummary("Reports overview KPIs (sales, inventory, prescriptions, trial balance) for a date range")
            .RequirePermission(AccountingPermissions.Reports.View);
    }
}
