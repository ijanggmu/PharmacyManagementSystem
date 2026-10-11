using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Accounting.Contracts.Authorization;
using FSH.Modules.Accounting.Contracts.v1.Reports;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Accounting.Features.v1.Reports.GetPeriodTrialBalance;

public static class GetPeriodTrialBalanceEndpoint
{
    internal static RouteHandlerBuilder MapGetPeriodTrialBalanceEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/reports/trial-balance-period",
                (DateTime fromUtc, DateTime toUtc, Guid? branchId, IMediator mediator, CancellationToken ct) =>
                    mediator.Send(new GetPeriodTrialBalanceQuery(fromUtc, toUtc, branchId), ct))
            .WithName("GetPeriodTrialBalance")
            .WithSummary("Trial balance for a period — opening, movement (with opening-balance vouchers split out) per account")
            .RequirePermission(AccountingPermissions.Reports.View);
    }
}
