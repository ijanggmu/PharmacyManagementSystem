using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Appointments.Contracts.Authorization;
using FSH.Modules.Appointments.Contracts.v1.Doctors;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Appointments.Features.v1.Doctors.SetDoctorWeeklySlots;

public static class SetDoctorWeeklySlotsEndpoint
{
    internal static RouteHandlerBuilder MapSetDoctorWeeklySlotsEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapPut("/doctors/{doctorId:guid}/weekly-slots",
                async (Guid doctorId, SetDoctorWeeklySlotsCommand body, IMediator mediator, CancellationToken ct) =>
                {
                    ArgumentNullException.ThrowIfNull(body);
                    var command = body with { DoctorId = doctorId };
                    return Results.Ok(await mediator.Send(command, ct));
                })
            .WithName("SetDoctorWeeklySlots")
            .WithSummary("Replace a doctor's weekly days (day, branch, times, patients per sitting)")
            .RequirePermission(AppointmentsPermissions.Doctors.Manage);
    }
}
