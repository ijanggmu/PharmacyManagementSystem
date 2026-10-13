using FSH.Framework.Shared.Identity.Authorization;
using FSH.Framework.Web.Idempotency;
using FSH.Modules.Sales.Contracts.Authorization;
using FSH.Modules.Sales.Contracts.Dtos;
using FSH.Modules.Sales.Contracts.v1.Ird;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Sales.Features.v1.Ird;

/// <summary>IRD CBMS e-billing: tenant settings, manual resend of a failed submission, and the bill register
/// (IRD materialized view).</summary>
public static class IrdEBillingEndpoints
{
    internal static void MapIrdEBillingEndpoints(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapGet("/ird/settings",
                async (IMediator mediator, CancellationToken ct) =>
                    TypedResults.Ok(await mediator.Send(new GetIrdSettingsQuery(), ct).ConfigureAwait(false)))
            .WithName("GetIrdSettings")
            .WithSummary("IRD CBMS e-billing settings (the CBMS password is never returned)")
            .RequirePermission(SalesPermissions.Sales.View)
            .Produces<IrdSettingsDto>(StatusCodes.Status200OK);

        endpoints.MapPut("/ird/settings",
                async (UpdateIrdSettingsCommand command, IMediator mediator, CancellationToken ct) =>
                    TypedResults.Ok(await mediator.Send(command, ct).ConfigureAwait(false)))
            .WithName("UpdateIrdSettings")
            .WithSummary("Update the IRD CBMS e-billing settings; an empty password keeps the stored one")
            .RequirePermission(SalesPermissions.Ird.Manage)
            .Produces<IrdSettingsDto>(StatusCodes.Status200OK);

        endpoints.MapPost("/ird/queue/{id:guid}/resend",
                async (Guid id, IMediator mediator, CancellationToken ct) =>
                    TypedResults.Ok(await mediator.Send(new ResendIrdQueueItemCommand(id), ct).ConfigureAwait(false)))
            .WithName("ResendIrdQueueItem")
            .WithSummary("Resend a failed IRD submission (bill or credit note) to CBMS now")
            .RequirePermission(SalesPermissions.Ird.Send)
            .Produces<IrdResendResultDto>(StatusCodes.Status200OK)
            .WithIdempotency();

        endpoints.MapGet("/reports/ird-bill-register",
                async (DateTime? fromUtc, DateTime? toUtc, int? fiscalYear, Guid? branchId, IMediator mediator, CancellationToken ct) =>
                    TypedResults.Ok(await mediator.Send(new GetIrdBillRegisterQuery(fromUtc, toUtc, fiscalYear, branchId), ct).ConfigureAwait(false)))
            .WithName("GetIrdBillRegister")
            .WithSummary("IRD materialized view: every bill with its IRD sync, print and buyer columns")
            .RequirePermission(SalesPermissions.Ird.View)
            .Produces<IReadOnlyList<IrdBillRegisterRowDto>>(StatusCodes.Status200OK);
    }
}
