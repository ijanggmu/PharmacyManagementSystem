using FSH.Framework.Shared.Identity.Authorization;
using FSH.Framework.Web.Idempotency;
using FSH.Modules.Accounting.Contracts.Authorization;
using FSH.Modules.Accounting.Contracts.v1.FixedAssets;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Accounting.Features.v1.FixedAssets.DisposeFixedAsset;

public static class CreateFixedAssetDisposalEndpoint
{
    internal static RouteHandlerBuilder MapCreateFixedAssetDisposalEndpoint(this IEndpointRouteBuilder endpoints) =>
        endpoints.MapPost("/fixed-assets/{id:guid}/disposal",
                async (Guid id, DisposeFixedAssetCommand command, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(command with { Id = id }, ct)))
            .WithName("CreateFixedAssetDisposal")
            .WithSummary("Sell or write off a fixed asset (removes cost and accumulated depreciation, books proceeds and gain/loss)")
            .RequirePermission(AccountingPermissions.Vouchers.Post)
            .WithIdempotency();
}
