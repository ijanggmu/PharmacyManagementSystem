using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Accounting.Contracts.Authorization;
using FSH.Modules.Accounting.Contracts.v1.Reports;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Accounting.Features.v1.Reports.GetProfitAndLossColumns;

public static class GetProfitAndLossColumnsEndpoint
{
    internal static RouteHandlerBuilder MapGetProfitAndLossColumnsEndpoint(this IEndpointRouteBuilder endpoints)
    {
        // Periods travel as repeated pairs: ?fromUtc=a&toUtc=b&fromUtc=c&toUtc=d — the n-th from pairs with the n-th to.
        return endpoints.MapGet("/reports/profit-and-loss/columns",
                (DateTime[] fromUtc, DateTime[] toUtc, Guid? branchId, IMediator mediator, CancellationToken ct) =>
                {
                    if (fromUtc.Length != toUtc.Length)
                    {
                        return Task.FromResult(Results.BadRequest("Every fromUtc needs a matching toUtc."));
                    }

                    var periods = fromUtc.Zip(toUtc, (f, t) => new ReportPeriod(f, t)).ToList();
                    return SendAsync(mediator, new GetProfitAndLossColumnsQuery(periods, branchId), ct);
                })
            .WithName("GetProfitAndLossColumns")
            .WithSummary("Profit & loss for several periods side by side — comparatives and the monthly trend")
            .RequirePermission(AccountingPermissions.Reports.View);
    }

    private static async Task<IResult> SendAsync(IMediator mediator, GetProfitAndLossColumnsQuery query, CancellationToken ct) =>
        Results.Ok(await mediator.Send(query, ct).ConfigureAwait(false));
}
