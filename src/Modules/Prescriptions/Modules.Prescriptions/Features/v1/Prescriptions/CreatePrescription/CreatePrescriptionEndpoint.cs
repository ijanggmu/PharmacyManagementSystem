using FSH.Framework.Shared.Identity.Authorization;
using FSH.Framework.Web.Idempotency;
using FSH.Modules.Prescriptions.Contracts.Authorization;
using FSH.Modules.Prescriptions.Contracts.v1.Prescriptions;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Prescriptions.Features.v1.Prescriptions.CreatePrescription;

public static class CreatePrescriptionEndpoint
{
    internal static RouteHandlerBuilder MapCreatePrescriptionEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapPost("",
                async (CreatePrescriptionCommand command, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(command, ct)))
            .WithName("CreatePrescription")
            .WithSummary("Create a prescription")
            .RequirePermission(PrescriptionsPermissions.Prescriptions.Create)
            .WithIdempotency();
    }
}
