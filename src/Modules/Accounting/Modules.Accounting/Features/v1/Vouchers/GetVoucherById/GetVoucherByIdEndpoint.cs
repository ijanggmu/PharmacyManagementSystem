using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Accounting.Contracts.Authorization;
using FSH.Modules.Accounting.Contracts.v1.Vouchers;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Accounting.Features.v1.Vouchers.GetVoucherById;

public static class GetVoucherByIdEndpoint
{
    internal static RouteHandlerBuilder MapGetVoucherByIdEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/vouchers/{voucherId:guid}",
                (Guid voucherId, IMediator mediator, CancellationToken ct) =>
                    mediator.Send(new GetVoucherByIdQuery(voucherId), ct))
            .WithName("GetVoucherById")
            .WithSummary("Get a voucher (with lines) by id")
            .RequirePermission(AccountingPermissions.Vouchers.View);
    }
}
