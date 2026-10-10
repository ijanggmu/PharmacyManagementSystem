using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Prescriptions.Contracts.Authorization;
using FSH.Modules.Prescriptions.Contracts.v1.Prescriptions;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Prescriptions.Features.v1.Prescriptions.UpdatePrescription;

public static class UpdatePrescriptionEndpoint
{
    internal static RouteHandlerBuilder MapUpdatePrescriptionEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapPut("/{prescriptionId:guid}",
                async (Guid prescriptionId, UpdatePrescriptionCommand body, IMediator mediator, CancellationToken ct) =>
                {
                    ArgumentNullException.ThrowIfNull(body);
                    var command = body with { PrescriptionId = prescriptionId };
                    return Results.Ok(await mediator.Send(command, ct));
                })
            .WithName("UpdatePrescription")
            .WithSummary("Update a prescription's doctor name or expiry date")
            .RequirePermission(PrescriptionsPermissions.Prescriptions.Update);
    }
}
