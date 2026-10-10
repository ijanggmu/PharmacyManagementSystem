using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Accounting.Contracts.Authorization;
using FSH.Modules.Accounting.Contracts.v1.Reports;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Accounting.Features.v1.Reports.GetTrialBalance;

public static class GetTrialBalanceEndpoint
{
    internal static RouteHandlerBuilder MapGetTrialBalanceEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/reports/trial-balance",
                (DateTime? asOfUtc, Guid? branchId, IMediator mediator, CancellationToken ct) =>
                    mediator.Send(new GetTrialBalanceQuery(asOfUtc ?? DateTime.UtcNow, branchId), ct))
            .WithName("GetTrialBalance")
            .WithSummary("Trial balance — posted debit/credit totals per account as of a date")
            .RequirePermission(AccountingPermissions.Reports.View);
    }
}
