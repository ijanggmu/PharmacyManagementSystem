using FSH.Framework.Shared.Identity.Authorization;
using FSH.Framework.Web.Idempotency;
using FSH.Modules.Accounting.Contracts.Authorization;
using FSH.Modules.Accounting.Contracts.v1.FixedAssets;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Accounting.Features.v1.FixedAssets.CreateFixedAsset;

public static class CreateFixedAssetEndpoint
{
    internal static RouteHandlerBuilder MapCreateFixedAssetEndpoint(this IEndpointRouteBuilder endpoints) =>
        endpoints.MapPost("/fixed-assets",
                async (CreateFixedAssetCommand command, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(command, ct)))
            .WithName("CreateFixedAsset")
            .WithSummary("Add a fixed asset and post its acquisition (Dr Fixed Assets + Input VAT / Cr Cash-Bank, Accounts Payable or opening equity)")
            .RequirePermission(AccountingPermissions.Vouchers.Post)
            .WithIdempotency();
}
