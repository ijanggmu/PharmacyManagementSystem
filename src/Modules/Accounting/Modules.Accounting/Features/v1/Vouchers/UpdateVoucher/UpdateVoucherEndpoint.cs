using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Accounting.Contracts.Authorization;
using FSH.Modules.Accounting.Contracts.v1.Vouchers;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Accounting.Features.v1.Vouchers.UpdateVoucher;

public static class UpdateVoucherEndpoint
{
    internal static RouteHandlerBuilder MapUpdateVoucherEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapPut("/vouchers/{voucherId:guid}",
                async (Guid voucherId, UpdateVoucherCommand body, IMediator mediator, CancellationToken ct) =>
                {
                    ArgumentNullException.ThrowIfNull(body);
                    var command = body with { VoucherId = voucherId };
                    return Results.Ok(await mediator.Send(command, ct));
                })
            .WithName("UpdateVoucher")
            .WithSummary("Update a draft manual journal voucher (date, narration and lines)")
            .RequirePermission(AccountingPermissions.Vouchers.Update);
    }
}
