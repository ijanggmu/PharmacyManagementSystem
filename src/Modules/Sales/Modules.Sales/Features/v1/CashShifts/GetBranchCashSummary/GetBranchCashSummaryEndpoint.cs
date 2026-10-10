using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Sales.Contracts.Authorization;
using FSH.Modules.Sales.Contracts.v1.CashShifts;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Sales.Features.v1.CashShifts.GetBranchCashSummary;

public static class GetBranchCashSummaryEndpoint
{
    internal static RouteHandlerBuilder MapGetBranchCashSummaryEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/cash-shifts/branch-summary",
                (IMediator mediator, CancellationToken ct) => mediator.Send(new GetBranchCashSummaryQuery(), ct))
            .WithName("GetBranchCashSummary")
            .WithSummary("Expected cash in drawer per branch (open shifts only)")
            .RequirePermission(SalesPermissions.CashShifts.View);
    }
}
