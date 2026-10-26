using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Appointments.Contracts.Authorization;
using FSH.Modules.Appointments.Contracts.v1.Doctors;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Appointments.Features.v1.Doctors.RemoveDoctorDayChange;

public static class RemoveDoctorDayChangeEndpoint
{
    internal static RouteHandlerBuilder MapRemoveDoctorDayChangeEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapDelete("/doctors/{doctorId:guid}/day-changes/{dayChangeId:guid}",
                async (Guid doctorId, Guid dayChangeId, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(new RemoveDoctorDayChangeCommand(doctorId, dayChangeId), ct)))
            .WithName("RemoveDoctorDayChange")
            .WithSummary("Remove a day off or extra day")
            .RequirePermission(AppointmentsPermissions.Doctors.Manage);
    }
}
