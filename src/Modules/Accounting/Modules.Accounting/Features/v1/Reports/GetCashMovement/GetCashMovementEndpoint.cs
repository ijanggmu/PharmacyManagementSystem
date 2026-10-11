using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Accounting.Contracts.Authorization;
using FSH.Modules.Accounting.Contracts.v1.Reports;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Accounting.Features.v1.Reports.GetCashMovement;

public static class GetCashMovementEndpoint
{
    internal static RouteHandlerBuilder MapGetCashMovementEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/reports/cash-movement",
                (DateTime fromUtc, DateTime toUtc, Guid? branchId, IMediator mediator, CancellationToken ct) =>
                    mediator.Send(new GetCashMovementQuery(fromUtc, toUtc, branchId), ct))
            .WithName("GetCashMovement")
            .WithSummary("Cash + Bank movement — opening balance, inflow/outflow, closing balance for a period")
            .RequirePermission(AccountingPermissions.Reports.View);
    }
}
