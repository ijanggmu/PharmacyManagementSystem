using FSH.Framework.Shared.Identity.Authorization;
using FSH.Framework.Web.Idempotency;
using FSH.Modules.Accounting.Contracts.Authorization;
using FSH.Modules.Accounting.Contracts.v1.Tds;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Accounting.Features.v1.Tds.RecordTdsPayment;

public static class CreateTdsPaymentEndpoint
{
    internal static RouteHandlerBuilder MapCreateTdsPaymentEndpoint(this IEndpointRouteBuilder endpoints) =>
        endpoints.MapPost("/tds/payments",
                async (RecordTdsPaymentCommand command, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(command, ct)))
            .WithName("CreateTdsPayment")
            .WithSummary("Record TDS deposited with IRD (Dr TDS Payable / Cr Cash or Bank)")
            .RequirePermission(AccountingPermissions.Vouchers.Post)
            .WithIdempotency();
}
