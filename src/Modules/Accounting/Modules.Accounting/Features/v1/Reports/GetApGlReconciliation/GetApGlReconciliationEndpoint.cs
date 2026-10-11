using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Accounting.Contracts.Authorization;
using FSH.Modules.Accounting.Contracts.v1.Reports;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Accounting.Features.v1.Reports.GetApGlReconciliation;

public static class GetApGlReconciliationEndpoint
{
    internal static RouteHandlerBuilder MapGetApGlReconciliationEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/reports/ap-gl-reconciliation",
                (Guid? branchId, IMediator mediator, CancellationToken ct) =>
                    mediator.Send(new GetApGlReconciliationQuery(branchId), ct))
            .WithName("GetApGlReconciliation")
            .WithSummary("Compare Suppliers' total AP balance against the Accounts Payable GL account, per branch or all")
            .RequirePermission(AccountingPermissions.Reports.View);
    }
}
