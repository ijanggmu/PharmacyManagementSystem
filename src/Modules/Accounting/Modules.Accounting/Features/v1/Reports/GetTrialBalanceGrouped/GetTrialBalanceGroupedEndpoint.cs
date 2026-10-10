using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Accounting.Contracts.Authorization;
using FSH.Modules.Accounting.Contracts.v1.Reports;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Accounting.Features.v1.Reports.GetTrialBalanceGrouped;

public static class GetTrialBalanceGroupedEndpoint
{
    internal static RouteHandlerBuilder MapGetTrialBalanceGroupedEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/reports/trial-balance-grouped",
                (DateTime? asOfUtc, Guid? branchId, IMediator mediator, CancellationToken ct) =>
                    mediator.Send(new GetTrialBalanceGroupedQuery(asOfUtc ?? DateTime.UtcNow, branchId), ct))
            .WithName("GetTrialBalanceGrouped")
            .WithSummary("Trial balance rolled up by account type, with per-account detail")
            .RequirePermission(AccountingPermissions.Reports.View);
    }
}
