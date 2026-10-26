using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Appointments.Contracts.Authorization;
using FSH.Modules.Appointments.Contracts.v1.Timetable;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Appointments.Features.v1.Timetable.GetTimetable;

public static class GetTimetableEndpoint
{
    internal static RouteHandlerBuilder MapGetTimetableEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/timetable",
                (DateOnly from, DateOnly to, Guid? branchId, Guid? doctorId, IMediator mediator, CancellationToken ct) =>
                    mediator.Send(new GetTimetableQuery(from, to, branchId, doctorId), ct))
            .WithName("GetDoctorTimetable")
            .WithSummary("The doctors' sittings for a date range (at most 31 days), with days off")
            .RequirePermission(AppointmentsPermissions.Doctors.View);
    }
}
