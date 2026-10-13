using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Accounting.Contracts.Authorization;
using FSH.Modules.Accounting.Contracts.v1.FixedAssets;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Accounting.Features.v1.FixedAssets.GetTaxPools;

public static class GetTaxPoolsEndpoint
{
    internal static RouteHandlerBuilder MapGetTaxPoolsEndpoint(this IEndpointRouteBuilder endpoints) =>
        endpoints.MapGet("/fixed-assets/tax-pools",
                async (IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(new GetTaxPoolsQuery(), ct)))
            .WithName("GetTaxPools")
            .WithSummary("Income Tax Act 2058 Schedule 2 depreciation pools and default rates")
            .RequirePermission(AccountingPermissions.Reports.View);
}
