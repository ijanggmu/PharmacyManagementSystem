using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Accounting.Contracts.Authorization;
using FSH.Modules.Accounting.Contracts.v1.Vouchers;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Accounting.Features.v1.Vouchers.ReverseVoucher;

public static class ReverseVoucherEndpoint
{
    internal static RouteHandlerBuilder MapReverseVoucherEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapPost("/vouchers/{voucherId:guid}/reverse",
                async (Guid voucherId, ReverseVoucherCommand? body, IMediator mediator, CancellationToken ct) =>
                {
                    var command = (body ?? new ReverseVoucherCommand(voucherId)) with { VoucherId = voucherId };
                    return Results.Ok(await mediator.Send(command, ct));
                })
            .WithName("ReverseVoucher")
            .WithSummary("Reverse a posted voucher with a fully offsetting entry")
            .RequirePermission(AccountingPermissions.Vouchers.Reverse);
    }
}
