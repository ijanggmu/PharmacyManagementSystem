using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Appointments.Contracts.Authorization;
using FSH.Modules.Appointments.Contracts.v1.Doctors;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Appointments.Features.v1.Doctors.UpdateDoctor;

public static class UpdateDoctorEndpoint
{
    internal static RouteHandlerBuilder MapUpdateDoctorEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapPut("/doctors/{doctorId:guid}",
                async (Guid doctorId, UpdateDoctorCommand body, IMediator mediator, CancellationToken ct) =>
                {
                    ArgumentNullException.ThrowIfNull(body);
                    var command = body with { DoctorId = doctorId };
                    return Results.Ok(await mediator.Send(command, ct));
                })
            .WithName("UpdateDoctor")
            .WithSummary("Change a doctor's details, fee or share")
            .RequirePermission(AppointmentsPermissions.Doctors.Manage);
    }
}
