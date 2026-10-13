using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Accounting.Contracts.Authorization;
using FSH.Modules.Accounting.Contracts.v1.FixedAssets;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Accounting.Features.v1.FixedAssets.UpdateFixedAsset;

public static class UpdateFixedAssetEndpoint
{
    internal static RouteHandlerBuilder MapUpdateFixedAssetEndpoint(this IEndpointRouteBuilder endpoints) =>
        endpoints.MapPut("/fixed-assets/{id:guid}",
                async (Guid id, UpdateFixedAssetCommand command, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(command with { Id = id }, ct)))
            .WithName("UpdateFixedAsset")
            .WithSummary("Edit a fixed asset (depreciation terms only until depreciation is posted)")
            .RequirePermission(AccountingPermissions.Vouchers.Post);
}
