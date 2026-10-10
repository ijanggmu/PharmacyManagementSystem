using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Accounting.Contracts.Authorization;
using FSH.Modules.Accounting.Contracts.v1.Vouchers;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Accounting.Features.v1.Vouchers.DeleteVoucher;

public static class DeleteVoucherEndpoint
{
    internal static RouteHandlerBuilder MapDeleteVoucherEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapDelete("/vouchers/{voucherId:guid}",
                async (Guid voucherId, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(new DeleteVoucherCommand(voucherId), ct)))
            .WithName("DeleteVoucher")
            .WithSummary("Delete a draft manual journal voucher")
            .RequirePermission(AccountingPermissions.Vouchers.Delete);
    }
}
