using FSH.Framework.Shared.Identity.Authorization;
using FSH.Framework.Web.Idempotency;
using FSH.Modules.Prescriptions.Contracts.Authorization;
using FSH.Modules.Prescriptions.Contracts.v1.Refills;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Prescriptions.Features.v1.Refills.CreatePrescriptionRefill;

public static class CreatePrescriptionRefillEndpoint
{
    internal static RouteHandlerBuilder MapCreatePrescriptionRefillEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapPost("/{prescriptionId:guid}/refills",
                async (Guid prescriptionId, CreatePrescriptionRefillCommand body, IMediator mediator, CancellationToken ct) =>
                {
                    ArgumentNullException.ThrowIfNull(body);
                    var command = body with { PrescriptionId = prescriptionId };
                    return Results.Ok(await mediator.Send(command, ct));
                })
            .WithName("CreatePrescriptionRefill")
            .WithSummary("Record a fill/refill against a prescription item")
            .WithDescription(
                "Records a fill without selling it (no stock movement, no narcotic-register entry). Controlled " +
                "medicines are refused with 409: dispense them through a sale.")
            .RequirePermission(PrescriptionsPermissions.Prescriptions.Create)
            .WithIdempotency();
    }
}
