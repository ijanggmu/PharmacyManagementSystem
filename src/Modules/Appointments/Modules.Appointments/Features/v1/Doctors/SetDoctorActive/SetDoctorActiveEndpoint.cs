using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Appointments.Contracts.Authorization;
using FSH.Modules.Appointments.Contracts.v1.Doctors;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Appointments.Features.v1.Doctors.SetDoctorActive;

public static class SetDoctorActiveEndpoint
{
    internal static RouteHandlerBuilder MapSetDoctorActiveEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapPost("/doctors/{doctorId:guid}/active",
                async (Guid doctorId, SetDoctorActiveCommand body, IMediator mediator, CancellationToken ct) =>
                {
                    ArgumentNullException.ThrowIfNull(body);
                    var command = body with { DoctorId = doctorId };
                    return Results.Ok(await mediator.Send(command, ct));
                })
            .WithName("SetDoctorActive")
            .WithSummary("Stop or restart a doctor (a stopped doctor drops out of the timetable)")
            .RequirePermission(AppointmentsPermissions.Doctors.Manage);
    }
}
