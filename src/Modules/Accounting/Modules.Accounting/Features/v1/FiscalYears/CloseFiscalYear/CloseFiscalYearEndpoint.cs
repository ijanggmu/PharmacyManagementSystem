using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Accounting.Contracts.Authorization;
using FSH.Modules.Accounting.Contracts.v1.FiscalYears;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Accounting.Features.v1.FiscalYears.CloseFiscalYear;

public static class CloseFiscalYearEndpoint
{
    internal static RouteHandlerBuilder MapCloseFiscalYearEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapPost("/fiscal-years/{fiscalYear:int}/close",
                async (int fiscalYear, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(new CloseFiscalYearCommand(fiscalYear), ct)))
            .WithName("CloseFiscalYear")
            .WithSummary("Close a fiscal year: transfer its revenue and expense balances to Retained Earnings and lock it")
            .RequirePermission(AccountingPermissions.PostingLock.CloseFiscalYear);
    }
}
