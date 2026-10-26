using FSH.Framework.Shared.Identity.Authorization;
using FSH.Framework.Web.Idempotency;
using FSH.Modules.Appointments.Contracts.Authorization;
using FSH.Modules.Appointments.Contracts.v1.Doctors;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Appointments.Features.v1.Doctors.AddDoctorDayChange;

public static class AddDoctorDayChangeEndpoint
{
    internal static RouteHandlerBuilder MapAddDoctorDayChangeEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapPost("/doctors/{doctorId:guid}/day-changes",
                async (Guid doctorId, AddDoctorDayChangeCommand body, IMediator mediator, CancellationToken ct) =>
                {
                    ArgumentNullException.ThrowIfNull(body);
                    var command = body with { DoctorId = doctorId };
                    return Results.Ok(await mediator.Send(command, ct));
                })
            .WithName("AddDoctorDayChange")
            .WithSummary("Mark a day off, or add an extra day, for one date")
            .RequirePermission(AppointmentsPermissions.Doctors.Manage)
            .WithIdempotency();
    }
}
