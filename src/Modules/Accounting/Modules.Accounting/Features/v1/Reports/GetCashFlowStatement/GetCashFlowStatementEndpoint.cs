using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Accounting.Contracts.Authorization;
using FSH.Modules.Accounting.Contracts.v1.Reports;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Accounting.Features.v1.Reports.GetCashFlowStatement;

public static class GetCashFlowStatementEndpoint
{
    internal static RouteHandlerBuilder MapGetCashFlowStatementEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/reports/cash-flow",
                (DateTime fromUtc, DateTime toUtc, Guid? branchId, IMediator mediator, CancellationToken ct) =>
                    mediator.Send(new GetCashFlowStatementQuery(fromUtc, toUtc, branchId), ct))
            .WithName("GetCashFlowStatement")
            .WithSummary("Cash flow statement (indirect method) — operating, investing and financing activities for a period")
            .RequirePermission(AccountingPermissions.Reports.View);
    }
}
