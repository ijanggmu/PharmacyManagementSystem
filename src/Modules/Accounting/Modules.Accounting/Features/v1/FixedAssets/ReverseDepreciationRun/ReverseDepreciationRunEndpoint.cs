using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Accounting.Contracts.Authorization;
using FSH.Modules.Accounting.Contracts.v1.FixedAssets;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Accounting.Features.v1.FixedAssets.ReverseDepreciationRun;

public static class ReverseDepreciationRunEndpoint
{
    internal static RouteHandlerBuilder MapReverseDepreciationRunEndpoint(this IEndpointRouteBuilder endpoints) =>
        endpoints.MapPost("/fixed-assets/depreciation/runs/{runId:guid}/reverse",
                async (Guid runId, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(new ReverseDepreciationRunCommand(runId), ct)))
            .WithName("ReverseDepreciationRun")
            .WithSummary("Reverse a depreciation run so its months can be posted again")
            .RequirePermission(AccountingPermissions.Vouchers.Reverse);
}
