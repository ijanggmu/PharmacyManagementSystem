using FSH.Framework.Shared.Identity.Authorization;
using FSH.Framework.Web.Idempotency;
using FSH.Modules.Accounting.Contracts.Authorization;
using FSH.Modules.Accounting.Contracts.v1.FixedAssets;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Accounting.Features.v1.FixedAssets.RunDepreciation;

public static class CreateDepreciationRunEndpoint
{
    internal static RouteHandlerBuilder MapCreateDepreciationRunEndpoint(this IEndpointRouteBuilder endpoints) =>
        endpoints.MapPost("/fixed-assets/depreciation/runs",
                async (RunDepreciationCommand command, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(command, ct)))
            .WithName("CreateDepreciationRun")
            .WithSummary("Post depreciation for a fiscal month or year (Dr Depreciation Expense / Cr Accumulated Depreciation; idempotent per asset-month)")
            .RequirePermission(AccountingPermissions.Vouchers.Post)
            .WithIdempotency();
}
