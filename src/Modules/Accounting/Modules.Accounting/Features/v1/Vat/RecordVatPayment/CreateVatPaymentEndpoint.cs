using FSH.Framework.Shared.Identity.Authorization;
using FSH.Framework.Web.Idempotency;
using FSH.Modules.Accounting.Contracts.Authorization;
using FSH.Modules.Accounting.Contracts.v1.Vat;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Accounting.Features.v1.Vat.RecordVatPayment;

public static class CreateVatPaymentEndpoint
{
    internal static RouteHandlerBuilder MapCreateVatPaymentEndpoint(this IEndpointRouteBuilder endpoints) =>
        endpoints.MapPost("/vat/payments",
                async (RecordVatPaymentCommand command, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(command, ct)))
            .WithName("CreateVatPayment")
            .WithSummary("Record a VAT payment to IRD (Dr VAT Payable / Cr Cash or Bank)")
            .RequirePermission(AccountingPermissions.Vouchers.Post)
            .WithIdempotency();
}
