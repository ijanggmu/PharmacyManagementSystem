using FSH.Framework.Shared.Identity.Authorization;
using FSH.Framework.Web.Idempotency;
using FSH.Modules.Accounting.Contracts.Authorization;
using FSH.Modules.Accounting.Contracts.v1.Cheques;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Accounting.Features.v1.Cheques;

/// <summary>
/// The register's actions. All four sit behind the bank-deposit permission (they move money in or out of the bank);
/// bounce and cancel also check the party module's void-payment permission in the handler.
/// </summary>
public static class ChequeActionEndpoints
{
    internal static RouteHandlerBuilder MapDepositChequeEndpoint(this IEndpointRouteBuilder endpoints) =>
        endpoints.MapPost("/banking/cheques/{id:guid}/deposit",
                async (Guid id, DepositChequeCommand body, IMediator mediator, CancellationToken ct) =>
                {
                    ArgumentNullException.ThrowIfNull(body);
                    return Results.Ok(await mediator.Send(body with { ChequeId = id }, ct));
                })
            .WithName("DepositCheque")
            .WithSummary("Mark a received cheque deposited, or an issued cheque presented (no posting)")
            .RequirePermission(AccountingPermissions.Banking.RecordDeposit)
            .WithIdempotency();

    internal static RouteHandlerBuilder MapClearChequeEndpoint(this IEndpointRouteBuilder endpoints) =>
        endpoints.MapPost("/banking/cheques/{id:guid}/clear",
                async (Guid id, ClearChequeCommand body, IMediator mediator, CancellationToken ct) =>
                {
                    ArgumentNullException.ThrowIfNull(body);
                    return Results.Ok(await mediator.Send(body with { ChequeId = id }, ct));
                })
            .WithName("ClearCheque")
            .WithSummary("Mark a cheque cleared (post-dated: Dr Bank / Cr Cheques in Hand, or Dr Cheques Issued / Cr Bank)")
            .RequirePermission(AccountingPermissions.Banking.RecordDeposit)
            .WithIdempotency();

    internal static RouteHandlerBuilder MapBounceChequeEndpoint(this IEndpointRouteBuilder endpoints) =>
        endpoints.MapPost("/banking/cheques/{id:guid}/bounce",
                async (Guid id, BounceChequeCommand body, IMediator mediator, CancellationToken ct) =>
                {
                    ArgumentNullException.ThrowIfNull(body);
                    return Results.Ok(await mediator.Send(body with { ChequeId = id }, ct));
                })
            .WithName("BounceCheque")
            .WithSummary("Mark a cheque bounced and void the payment it settled")
            .RequirePermission(AccountingPermissions.Banking.RecordDeposit)
            .WithIdempotency();

    internal static RouteHandlerBuilder MapCancelChequeEndpoint(this IEndpointRouteBuilder endpoints) =>
        endpoints.MapPost("/banking/cheques/{id:guid}/cancel",
                async (Guid id, CancelChequeCommand body, IMediator mediator, CancellationToken ct) =>
                {
                    ArgumentNullException.ThrowIfNull(body);
                    return Results.Ok(await mediator.Send(body with { ChequeId = id }, ct));
                })
            .WithName("CancelCheque")
            .WithSummary("Cancel a cheque that never reached the bank and void the payment it settled")
            .RequirePermission(AccountingPermissions.Banking.RecordDeposit)
            .WithIdempotency();
}
