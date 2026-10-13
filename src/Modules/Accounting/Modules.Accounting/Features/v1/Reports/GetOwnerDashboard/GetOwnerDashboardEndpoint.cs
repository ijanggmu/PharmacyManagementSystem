using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Accounting.Contracts.Authorization;
using FSH.Modules.Accounting.Contracts.v1.Reports;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Accounting.Features.v1.Reports.GetOwnerDashboard;

public static class GetOwnerDashboardEndpoint
{
    internal static RouteHandlerBuilder MapGetOwnerDashboardEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/reports/owner-dashboard",
                (Guid? branchId, DateTime? monthStartUtc, IMediator mediator, CancellationToken ct) =>
                    mediator.Send(new GetOwnerDashboardQuery(branchId, monthStartUtc), ct))
            .WithName("GetOwnerDashboard")
            .WithSummary("Owner dashboard KPIs: today/month sales, gross margin, stock, receivables, payables, cash and bank, VAT payable, top medicines by margin")
            .RequirePermission(AccountingPermissions.Reports.View);
    }
}
