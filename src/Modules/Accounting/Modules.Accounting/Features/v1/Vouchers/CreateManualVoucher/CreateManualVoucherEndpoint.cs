using FSH.Framework.Shared.Identity.Authorization;
using FSH.Framework.Web.Idempotency;
using FSH.Modules.Accounting.Contracts.Authorization;
using FSH.Modules.Accounting.Contracts.v1.Vouchers;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Accounting.Features.v1.Vouchers.CreateManualVoucher;

public static class CreateManualVoucherEndpoint
{
    internal static RouteHandlerBuilder MapCreateManualVoucherEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapPost("/vouchers",
                async (CreateManualVoucherCommand command, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(command, ct)))
            .WithName("CreateManualVoucher")
            .WithSummary("Create a draft manual journal voucher")
            .RequirePermission(AccountingPermissions.Vouchers.Create)
            .WithIdempotency();
    }
}
