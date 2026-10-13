using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Accounting.Contracts.Authorization;
using FSH.Modules.Accounting.Contracts.v1.Reports;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Accounting.Features.v1.Reports.GetVatReturn;

public static class GetVatReturnEndpoint
{
    internal static RouteHandlerBuilder MapGetVatReturnEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/reports/vat-return",
                (DateTime fromUtc, DateTime toUtc, Guid? branchId, IMediator mediator, CancellationToken ct) =>
                    mediator.Send(new GetVatReturnQuery(fromUtc, toUtc, branchId), ct))
            .WithName("GetVatReturn")
            .WithSummary("VAT return in IRD monthly layout — sales/purchase turnover from the IRD registers, VAT from the ledger, credit carried forward and a register-vs-ledger reconciliation; per branch or all")
            .RequirePermission(AccountingPermissions.Reports.View);
    }
}
