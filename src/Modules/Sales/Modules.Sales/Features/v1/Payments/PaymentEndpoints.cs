using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Sales.Contracts.Authorization;
using FSH.Modules.Sales.Contracts.v1.Payments;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Sales.Features.v1.Payments;

public static class PaymentEndpoints
{
    internal static void MapPaymentEndpoints(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapGet("/payment-settings",
                async (IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(new GetPaymentSettingsQuery(), ct)))
            .WithName("GetPaymentSettings")
            .WithSummary("Get the POS payment settings (static bank QR and Fonepay); secrets are never returned")
            .RequirePermission(SalesPermissions.Sales.View);

        endpoints.MapPut("/payment-settings",
                async (UpdatePaymentSettingsCommand command, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(command, ct)))
            .WithName("UpdatePaymentSettings")
            .WithSummary("Update the POS payment settings; empty Fonepay password/secret keep the stored values")
            .RequirePermission(SalesPermissions.PaymentSettings.Update);

        endpoints.MapPost("/fonepay/qr",
                async (CreateFonepayQrCommand command, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(command, ct)))
            .WithName("CreateFonepayQr")
            .WithSummary("Request a Fonepay dynamic QR for an amount")
            .RequirePermission(SalesPermissions.Sales.Create);

        endpoints.MapGet("/fonepay/qr/{prn}/status",
                async (string prn, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(new GetFonepayQrStatusQuery(prn), ct)))
            .WithName("GetFonepayQrStatus")
            .WithSummary("Check (and refresh from Fonepay) the payment status of a dynamic QR")
            .RequirePermission(SalesPermissions.Sales.Create);
    }
}
