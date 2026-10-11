using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Prescriptions.Contracts.Authorization;
using FSH.Modules.Prescriptions.Contracts.v1.Prescriptions;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Prescriptions.Features.v1.Prescriptions.CancelPrescription;

public static class VoidPrescriptionEndpoint
{
    internal static RouteHandlerBuilder MapVoidPrescriptionEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapPost("/{prescriptionId:guid}/cancel",
                async (Guid prescriptionId, CancelPrescriptionCommand body, IMediator mediator, CancellationToken ct) =>
                {
                    ArgumentNullException.ThrowIfNull(body);
                    var command = body with { PrescriptionId = prescriptionId };
                    return Results.Ok(await mediator.Send(command, ct));
                })
            .WithName("VoidPrescription")
            .WithSummary("Cancel a prescription")
            .RequirePermission(PrescriptionsPermissions.Prescriptions.Cancel);
    }
}
