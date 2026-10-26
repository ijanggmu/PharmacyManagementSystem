using FSH.Framework.Shared.Identity.Authorization;
using FSH.Framework.Web.Idempotency;
using FSH.Modules.Appointments.Contracts.Authorization;
using FSH.Modules.Appointments.Contracts.v1.Appointments;
using FSH.Modules.Appointments.Contracts.v1.Payouts;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Appointments.Features.v1;

// Routes are relative to the module group "api/v1/appointments". Tokens: reads need Appointments.View, booking needs
// Appointments.Book, moving a token along on the day (fee, seen, didn't come, cancel) needs Appointments.CheckIn.
// Doctor payouts: Payouts.View to read what is owed, Payouts.Pay to pay it.

public static class GetDaySheetEndpoint
{
    internal static RouteHandlerBuilder MapGetDaySheetEndpoint(this IEndpointRouteBuilder endpoints) =>
        endpoints.MapGet("/bookings/day",
                async (DateOnly date, Guid? branchId, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(new GetDaySheetQuery(date, branchId), ct)))
            .WithName("GetAppointmentDaySheet")
            .WithSummary("Every doctor sitting on a date, each with its tokens")
            .RequirePermission(AppointmentsPermissions.Appointments.View);
}

public static class SearchAppointmentsEndpoint
{
    internal static RouteHandlerBuilder MapSearchAppointmentsEndpoint(this IEndpointRouteBuilder endpoints) =>
        endpoints.MapGet("/bookings",
                async (string? search, Guid? doctorId, string? status, DateOnly? dateFrom, DateOnly? dateTo,
                       int? pageNumber, int? pageSize, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(
                        new SearchAppointmentsQuery(
                            search, doctorId, status, dateFrom, dateTo,
                            pageNumber is null or 0 ? 1 : pageNumber.Value,
                            pageSize is null or 0 ? 50 : pageSize.Value),
                        ct)))
            .WithName("SearchAppointments")
            .WithSummary("Appointment history (paged; by patient name or phone, doctor, status and date)")
            .RequirePermission(AppointmentsPermissions.Appointments.View);
}

public static class GetAppointmentByIdEndpoint
{
    internal static RouteHandlerBuilder MapGetAppointmentByIdEndpoint(this IEndpointRouteBuilder endpoints) =>
        endpoints.MapGet("/bookings/{id:guid}",
                async (Guid id, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(new GetAppointmentByIdQuery(id), ct)))
            .WithName("GetAppointmentById")
            .WithSummary("One token")
            .RequirePermission(AppointmentsPermissions.Appointments.View);
}

public static class CreateBookingEndpoint
{
    internal static RouteHandlerBuilder MapCreateBookingEndpoint(this IEndpointRouteBuilder endpoints) =>
        endpoints.MapPost("/bookings",
                async (BookTokenCommand command, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(command, ct)))
            .WithName("BookAppointmentToken")
            .WithSummary("Book the next token in a doctor's sitting")
            .RequirePermission(AppointmentsPermissions.Appointments.Book)
            .WithIdempotency();
}

public static class MarkAppointmentArrivedEndpoint
{
    internal static RouteHandlerBuilder MapMarkAppointmentArrivedEndpoint(this IEndpointRouteBuilder endpoints) =>
        endpoints.MapPost("/bookings/{id:guid}/arrive",
                async (Guid id, MarkAppointmentArrivedCommand body, IMediator mediator, CancellationToken ct) =>
                {
                    ArgumentNullException.ThrowIfNull(body);
                    return Results.Ok(await mediator.Send(body with { AppointmentId = id }, ct));
                })
            .WithName("MarkAppointmentArrived")
            .WithSummary("The patient came: take the fee")
            .RequirePermission(AppointmentsPermissions.Appointments.CheckIn)
            .WithIdempotency();
}

public static class MarkAppointmentSeenEndpoint
{
    internal static RouteHandlerBuilder MapMarkAppointmentSeenEndpoint(this IEndpointRouteBuilder endpoints) =>
        endpoints.MapPost("/bookings/{id:guid}/seen",
                async (Guid id, MarkAppointmentSeenCommand body, IMediator mediator, CancellationToken ct) =>
                {
                    ArgumentNullException.ThrowIfNull(body);
                    return Results.Ok(await mediator.Send(body with { AppointmentId = id }, ct));
                })
            .WithName("MarkAppointmentSeen")
            .WithSummary("The doctor saw the patient (optionally linking the prescription written)")
            .RequirePermission(AppointmentsPermissions.Appointments.CheckIn);
}

public static class MarkAppointmentNoShowEndpoint
{
    internal static RouteHandlerBuilder MapMarkAppointmentNoShowEndpoint(this IEndpointRouteBuilder endpoints) =>
        endpoints.MapPost("/bookings/{id:guid}/no-show",
                async (Guid id, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(new MarkAppointmentNoShowCommand(id), ct)))
            .WithName("MarkAppointmentNoShow")
            .WithSummary("The patient didn't come")
            .RequirePermission(AppointmentsPermissions.Appointments.CheckIn);
}

public static class CancelAppointmentEndpoint
{
    internal static RouteHandlerBuilder MapCancelAppointmentEndpoint(this IEndpointRouteBuilder endpoints) =>
        endpoints.MapPost("/bookings/{id:guid}/cancel",
                async (Guid id, CancelAppointmentCommand body, IMediator mediator, CancellationToken ct) =>
                {
                    ArgumentNullException.ThrowIfNull(body);
                    return Results.Ok(await mediator.Send(body with { AppointmentId = id }, ct));
                })
            .WithName("CancelAppointment")
            .WithSummary("Cancel a token (gives back a fee already taken)")
            .RequirePermission(AppointmentsPermissions.Appointments.CheckIn)
            .WithIdempotency();
}

public static class GetDoctorBalanceEndpoint
{
    internal static RouteHandlerBuilder MapGetDoctorBalanceEndpoint(this IEndpointRouteBuilder endpoints) =>
        endpoints.MapGet("/doctors/{id:guid}/balance",
                async (Guid id, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(new GetDoctorBalanceQuery(id), ct)))
            .WithName("GetDoctorBalance")
            .WithSummary("What the pharmacy owes the doctor now")
            .RequirePermission(AppointmentsPermissions.Payouts.View);
}

public static class CreateDoctorPayoutEndpoint
{
    internal static RouteHandlerBuilder MapCreateDoctorPayoutEndpoint(this IEndpointRouteBuilder endpoints) =>
        endpoints.MapPost("/doctors/{id:guid}/payouts",
                async (Guid id, PayDoctorCommand body, IMediator mediator, CancellationToken ct) =>
                {
                    ArgumentNullException.ThrowIfNull(body);
                    return Results.Ok(await mediator.Send(body with { DoctorId = id }, ct));
                })
            .WithName("PayDoctor")
            .WithSummary("Pay the doctor everything owed now")
            .RequirePermission(AppointmentsPermissions.Payouts.Pay)
            .WithIdempotency();
}

public static class SearchDoctorPayoutsEndpoint
{
    internal static RouteHandlerBuilder MapSearchDoctorPayoutsEndpoint(this IEndpointRouteBuilder endpoints) =>
        endpoints.MapGet("/payouts",
                async (Guid? doctorId, int? pageNumber, int? pageSize, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(
                        new SearchDoctorPayoutsQuery(
                            doctorId,
                            pageNumber is null or 0 ? 1 : pageNumber.Value,
                            pageSize is null or 0 ? 50 : pageSize.Value),
                        ct)))
            .WithName("SearchDoctorPayouts")
            .WithSummary("Payments made to doctors, newest first")
            .RequirePermission(AppointmentsPermissions.Payouts.View);
}
