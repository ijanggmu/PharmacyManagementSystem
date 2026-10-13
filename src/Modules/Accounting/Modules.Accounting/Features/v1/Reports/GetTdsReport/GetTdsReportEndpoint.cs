using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Accounting.Contracts.Authorization;
using FSH.Modules.Accounting.Contracts.v1.Reports;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Accounting.Features.v1.Reports.GetTdsReport;

public static class GetTdsReportEndpoint
{
    internal static RouteHandlerBuilder MapGetTdsReportEndpoint(this IEndpointRouteBuilder endpoints) =>
        endpoints.MapGet("/reports/tds",
                (DateTime fromUtc, DateTime toUtc, Guid? branchId, IMediator mediator, CancellationToken ct) =>
                    mediator.Send(new GetTdsReportQuery(fromUtc, toUtc, branchId), ct))
            .WithName("GetTdsReport")
            .WithSummary("TDS deducted in the period — per deduction (vendor, PAN, category, taxable, rate, TDS) with totals per category, TDS deposited and the TDS payable balance")
            .RequirePermission(AccountingPermissions.Reports.View);
}
