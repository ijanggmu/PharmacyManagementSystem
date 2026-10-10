using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Prescriptions.Contracts.Authorization;
using FSH.Modules.Prescriptions.Contracts.v1.Prescriptions;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Prescriptions.Features.v1.Prescriptions.GetPrescriptionById;

public static class GetPrescriptionByIdEndpoint
{
    internal static RouteHandlerBuilder MapGetPrescriptionByIdEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/{prescriptionId:guid}",
                (Guid prescriptionId, IMediator mediator, CancellationToken ct) =>
                    mediator.Send(new GetPrescriptionByIdQuery(prescriptionId), ct))
            .WithName("GetPrescriptionById")
            .WithSummary("Get a prescription (with items) by id")
            .RequirePermission(PrescriptionsPermissions.Prescriptions.View);
    }
}
