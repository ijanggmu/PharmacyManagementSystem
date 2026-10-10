using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Accounting.Contracts.Authorization;
using FSH.Modules.Accounting.Contracts.v1.Reports;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Accounting.Features.v1.Reports.GetProfitAndLoss;

public static class GetProfitAndLossEndpoint
{
    internal static RouteHandlerBuilder MapGetProfitAndLossEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/reports/profit-and-loss",
                (DateTime fromUtc, DateTime toUtc, Guid? branchId, IMediator mediator, CancellationToken ct) =>
                    mediator.Send(new GetProfitAndLossQuery(fromUtc, toUtc, branchId), ct))
            .WithName("GetProfitAndLoss")
            .WithSummary("Profit & loss — revenue and expense totals for a period")
            .RequirePermission(AccountingPermissions.Reports.View);
    }
}
