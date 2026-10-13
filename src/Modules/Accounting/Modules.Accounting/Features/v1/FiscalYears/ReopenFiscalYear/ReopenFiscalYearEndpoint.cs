using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Accounting.Contracts.Authorization;
using FSH.Modules.Accounting.Contracts.v1.FiscalYears;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Accounting.Features.v1.FiscalYears.ReopenFiscalYear;

public static class ReopenFiscalYearEndpoint
{
    internal static RouteHandlerBuilder MapReopenFiscalYearEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapPost("/fiscal-years/{fiscalYear:int}/reopen",
                async (int fiscalYear, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(new ReopenFiscalYearCommand(fiscalYear), ct)))
            .WithName("ReopenFiscalYear")
            .WithSummary("Reopen the latest closed fiscal year by reversing its closing vouchers (the posting lock is unchanged)")
            .RequirePermission(AccountingPermissions.PostingLock.CloseFiscalYear);
    }
}
