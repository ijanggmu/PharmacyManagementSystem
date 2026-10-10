using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Prescriptions.Contracts.Authorization;
using FSH.Modules.Prescriptions.Contracts.v1.Refills;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Prescriptions.Features.v1.Refills.GetPrescriptionRefillById;

public static class GetPrescriptionRefillByIdEndpoint
{
    internal static RouteHandlerBuilder MapGetPrescriptionRefillByIdEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/refills/{refillId:guid}",
                (Guid refillId, IMediator mediator, CancellationToken ct) =>
                    mediator.Send(new GetPrescriptionRefillByIdQuery(refillId), ct))
            .WithName("GetPrescriptionRefillById")
            .WithSummary("Get a recorded prescription refill by id")
            .RequirePermission(PrescriptionsPermissions.Prescriptions.View);
    }
}
