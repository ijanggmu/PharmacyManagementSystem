using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Prescriptions.Contracts.Authorization;
using FSH.Modules.Prescriptions.Contracts.v1.Prescriptions;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Prescriptions.Features.v1.Prescriptions.DeletePrescription;

public static class DeletePrescriptionEndpoint
{
    internal static RouteHandlerBuilder MapDeletePrescriptionEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapDelete("/{prescriptionId:guid}",
                async (Guid prescriptionId, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(new DeletePrescriptionCommand(prescriptionId), ct)))
            .WithName("DeletePrescription")
            .WithSummary("Delete a prescription that has no dispensed items")
            .RequirePermission(PrescriptionsPermissions.Prescriptions.Delete);
    }
}
