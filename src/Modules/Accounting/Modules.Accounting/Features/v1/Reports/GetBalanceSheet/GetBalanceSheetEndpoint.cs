using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Accounting.Contracts.Authorization;
using FSH.Modules.Accounting.Contracts.v1.Reports;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Accounting.Features.v1.Reports.GetBalanceSheet;

public static class GetBalanceSheetEndpoint
{
    internal static RouteHandlerBuilder MapGetBalanceSheetEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/reports/balance-sheet",
                (DateTime? asOfUtc, Guid? branchId, IMediator mediator, CancellationToken ct) =>
                    mediator.Send(new GetBalanceSheetQuery(asOfUtc ?? DateTime.UtcNow, branchId), ct))
            .WithName("GetBalanceSheet")
            .WithSummary("Balance sheet — assets, liabilities, and equity as of a date")
            .RequirePermission(AccountingPermissions.Reports.View);
    }
}
