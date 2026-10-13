using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Accounting.Contracts.Authorization;
using FSH.Modules.Accounting.Contracts.v1.Reports;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Accounting.Features.v1.Reports.UpdateCashFlowClassifications;

public static class UpdateCashFlowClassificationsEndpoint
{
    internal static RouteHandlerBuilder MapUpdateCashFlowClassificationsEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapPut("/reports/cash-flow/classifications",
                async (UpdateCashFlowClassificationsCommand command, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(command, ct)))
            .WithName("UpdateCashFlowClassifications")
            .WithSummary("Tag accounts as operating, investing, financing or non-cash for the cash flow statement (null clears a tag)")
            .RequirePermission(AccountingPermissions.Accounts.Update);
    }
}
