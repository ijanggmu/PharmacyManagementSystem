using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Accounting.Contracts.Authorization;
using FSH.Modules.Accounting.Contracts.v1.FiscalYears;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Accounting.Features.v1.FiscalYears.GetFiscalYears;

public static class GetFiscalYearsEndpoint
{
    internal static RouteHandlerBuilder MapGetFiscalYearsEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/fiscal-years",
                async (IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(new GetFiscalYearsQuery(), ct)))
            .WithName("GetFiscalYears")
            .WithSummary("List fiscal years with their year-end close status")
            .RequirePermission(AccountingPermissions.PostingLock.View);
    }
}
