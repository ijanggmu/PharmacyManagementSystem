using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Appointments.Contracts.Authorization;
using FSH.Modules.Appointments.Contracts.v1.Online;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Appointments.Features.v1;

// The owner's switch lives under the signed-in group "api/v1/appointments" (reading it needs Doctors.View, changing
// it Doctors.Manage). The public page's two calls live under the anonymous group "api/v1/appointments/online": the
// pharmacy is the request's tenant, and both answer 404 while the owner has online booking off. The Explore page
// lives under the anonymous group "api/v1/appointments/explore" and lists every pharmacy that chose to be shown.

public static class GetAppointmentSettingsEndpoint
{
    internal static RouteHandlerBuilder MapGetAppointmentSettingsEndpoint(this IEndpointRouteBuilder endpoints) =>
        endpoints.MapGet("/settings",
                async (IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(new GetAppointmentSettingsQuery(), ct)))
            .WithName("GetAppointmentSettings")
            .WithSummary("The online-booking switch and its limits")
            .RequirePermission(AppointmentsPermissions.Doctors.View);
}

public static class UpdateAppointmentSettingsEndpoint
{
    internal static RouteHandlerBuilder MapUpdateAppointmentSettingsEndpoint(this IEndpointRouteBuilder endpoints) =>
        endpoints.MapPut("/settings",
                async (UpdateAppointmentSettingsCommand command, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(command, ct)))
            .WithName("UpdateAppointmentSettings")
            .WithSummary("Turn online booking on or off and set its limits")
            .RequirePermission(AppointmentsPermissions.Doctors.Manage);
}

public static class GetOnlineBookingPageEndpoint
{
    internal static RouteHandlerBuilder MapGetOnlineBookingPageEndpoint(this IEndpointRouteBuilder endpoints) =>
        endpoints.MapGet("/",
                async (IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(new GetOnlineBookingPageQuery(), ct)))
            .WithName("GetOnlineBookingPage")
            .WithSummary("Public: the pharmacy's doctors and the sittings patients can book")
            .AllowAnonymous();
}

public static class CreateOnlineBookingEndpoint
{
    internal static RouteHandlerBuilder MapCreateOnlineBookingEndpoint(this IEndpointRouteBuilder endpoints) =>
        endpoints.MapPost("/bookings",
                async (BookOnlineTokenCommand command, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(command, ct)))
            .WithName("BookOnlineToken")
            .WithSummary("Public: a patient books the next token in a sitting")
            .AllowAnonymous()
            .RequireRateLimiting(Services.OnlineBooking.RateLimitPolicy);
}

public static class GetExploreDoctorsEndpoint
{
    internal static RouteHandlerBuilder MapGetExploreDoctorsEndpoint(this IEndpointRouteBuilder endpoints) =>
        endpoints.MapGet("/",
                async (IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(new GetExploreDoctorsQuery(), ct)))
            .WithName("GetExploreDoctors")
            .WithSummary("Public: doctors of every pharmacy listed on the Explore page, with their bookable sittings")
            .AllowAnonymous()
            .RequireRateLimiting(Services.OnlineBooking.ExploreRateLimitPolicy);
}
