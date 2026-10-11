using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Accounting.Contracts.Authorization;
using FSH.Modules.Accounting.Contracts.v1.Reports;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Accounting.Features.v1.Reports.GetArGlReconciliation;

public static class GetArGlReconciliationEndpoint
{
    internal static RouteHandlerBuilder MapGetArGlReconciliationEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/reports/ar-gl-reconciliation",
                (Guid? branchId, IMediator mediator, CancellationToken ct) =>
                    mediator.Send(new GetArGlReconciliationQuery(branchId), ct))
            .WithName("GetArGlReconciliation")
            .WithSummary("Compare Customers' total AR balance against the Accounts Receivable GL account, per branch or all")
            .RequirePermission(AccountingPermissions.Reports.View);
    }
}
