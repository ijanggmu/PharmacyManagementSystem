using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Accounting.Contracts.Authorization;
using FSH.Modules.Accounting.Contracts.v1.Reports;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Accounting.Features.v1.Reports.GetCashFlowClassifications;

public static class GetCashFlowClassificationsEndpoint
{
    internal static RouteHandlerBuilder MapGetCashFlowClassificationsEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/reports/cash-flow/classifications",
                (IMediator mediator, CancellationToken ct) => mediator.Send(new GetCashFlowClassificationsQuery(), ct))
            .WithName("GetCashFlowClassifications")
            .WithSummary("Every account's cash flow activity — its own tag, the default and the activity in effect")
            .RequirePermission(AccountingPermissions.Reports.View);
    }
}
