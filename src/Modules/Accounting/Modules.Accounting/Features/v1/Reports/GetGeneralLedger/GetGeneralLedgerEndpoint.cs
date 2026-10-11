using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Accounting.Contracts.Authorization;
using FSH.Modules.Accounting.Contracts.v1.Reports;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Accounting.Features.v1.Reports.GetGeneralLedger;

public static class GetGeneralLedgerEndpoint
{
    internal static RouteHandlerBuilder MapGetGeneralLedgerEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/reports/general-ledger/{accountId:guid}",
                (Guid accountId, DateTime fromUtc, DateTime toUtc, Guid? branchId, int? pageNumber, int? pageSize,
                        IMediator mediator, CancellationToken ct) =>
                    mediator.Send(
                        new GetGeneralLedgerQuery(
                            accountId, fromUtc, toUtc, branchId,
                            pageNumber is null or 0 ? 1 : pageNumber.Value,
                            pageSize is null or 0 ? 50 : pageSize.Value),
                        ct))
            .WithName("GetGeneralLedger")
            .WithSummary("General ledger detail for one account over a period, with running balance (lines paged)")
            .RequirePermission(AccountingPermissions.Reports.View);
    }
}
