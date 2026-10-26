using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Appointments.Contracts.Authorization;
using FSH.Modules.Appointments.Contracts.v1.Doctors;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Appointments.Features.v1.Doctors.GetDoctorById;

public static class GetDoctorByIdEndpoint
{
    internal static RouteHandlerBuilder MapGetDoctorByIdEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/doctors/{doctorId:guid}",
                (Guid doctorId, IMediator mediator, CancellationToken ct) =>
                    mediator.Send(new GetDoctorByIdQuery(doctorId), ct))
            .WithName("GetDoctorById")
            .WithSummary("Get a doctor with weekly days and day changes")
            .RequirePermission(AppointmentsPermissions.Doctors.View);
    }
}
