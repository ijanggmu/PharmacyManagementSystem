using FSH.Framework.Shared.Identity.Authorization;
using FSH.Framework.Web.Idempotency;
using FSH.Modules.Accounting.Contracts.Authorization;
using FSH.Modules.Accounting.Contracts.v1.Vouchers;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Accounting.Features.v1.Vouchers.PostVoucher;

public static class FinalizeVoucherEndpoint
{
    internal static RouteHandlerBuilder MapFinalizeVoucherEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapPost("/vouchers/{voucherId:guid}/post",
                async (Guid voucherId, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(new PostVoucherCommand(voucherId), ct)))
            .WithName("FinalizeVoucher")
            .WithSummary("Post a draft voucher (asserts it balances)")
            .RequirePermission(AccountingPermissions.Vouchers.Post)
            .WithIdempotency();
    }
}
