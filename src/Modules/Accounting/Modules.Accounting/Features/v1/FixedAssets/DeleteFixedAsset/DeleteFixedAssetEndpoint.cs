using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Accounting.Contracts.Authorization;
using FSH.Modules.Accounting.Contracts.v1.FixedAssets;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Accounting.Features.v1.FixedAssets.DeleteFixedAsset;

public static class DeleteFixedAssetEndpoint
{
    internal static RouteHandlerBuilder MapDeleteFixedAssetEndpoint(this IEndpointRouteBuilder endpoints) =>
        endpoints.MapDelete("/fixed-assets/{id:guid}",
                async (Guid id, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(new DeleteFixedAssetCommand(id), ct)))
            .WithName("DeleteFixedAsset")
            .WithSummary("Delete a fixed asset entered by mistake (reverses its acquisition voucher)")
            .RequirePermission(AccountingPermissions.Vouchers.Post);
}
