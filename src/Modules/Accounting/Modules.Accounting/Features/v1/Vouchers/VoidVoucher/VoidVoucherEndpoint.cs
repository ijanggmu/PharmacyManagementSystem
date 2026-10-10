using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Accounting.Contracts.Authorization;
using FSH.Modules.Accounting.Contracts.v1.Vouchers;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Accounting.Features.v1.Vouchers.VoidVoucher;

public static class VoidVoucherEndpoint
{
    internal static RouteHandlerBuilder MapVoidVoucherEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapPost("/vouchers/{voucherId:guid}/void",
                async (Guid voucherId, VoidVoucherCommand body, IMediator mediator, CancellationToken ct) =>
                {
                    ArgumentNullException.ThrowIfNull(body);
                    var command = body with { VoucherId = voucherId };
                    return Results.Ok(await mediator.Send(command, ct));
                })
            .WithName("VoidVoucher")
            .WithSummary("Void a posted voucher")
            .RequirePermission(AccountingPermissions.Vouchers.Void);
    }
}
