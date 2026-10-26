using FSH.Framework.Shared.Identity.Authorization;
using FSH.Framework.Web.Idempotency;
using FSH.Modules.Appointments.Contracts.Authorization;
using FSH.Modules.Appointments.Contracts.v1.Doctors;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Appointments.Features.v1.Doctors.CreateDoctor;

public static class CreateDoctorEndpoint
{
    internal static RouteHandlerBuilder MapCreateDoctorEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapPost("/doctors",
                async (CreateDoctorCommand command, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(command, ct)))
            .WithName("CreateDoctor")
            .WithSummary("Add a visiting doctor")
            .RequirePermission(AppointmentsPermissions.Doctors.Manage)
            .WithIdempotency();
    }
}
