using Asp.Versioning;
using FSH.Framework.Persistence;
using FSH.Framework.Shared.Constants;
using FSH.Framework.Web.Modules;
using FSH.Modules.Appointments.Contracts.Authorization;
using FSH.Modules.Appointments.Data;
using FSH.Modules.Appointments.Features.v1;
using FSH.Modules.Appointments.Features.v1.Doctors.AddDoctorDayChange;
using FSH.Modules.Appointments.Features.v1.Doctors.CreateDoctor;
using FSH.Modules.Appointments.Features.v1.Doctors.GetDoctorById;
using FSH.Modules.Appointments.Features.v1.Doctors.RemoveDoctorDayChange;
using FSH.Modules.Appointments.Features.v1.Doctors.SearchDoctors;
using FSH.Modules.Appointments.Features.v1.Doctors.SetDoctorActive;
using FSH.Modules.Appointments.Features.v1.Doctors.SetDoctorWeeklySlots;
using FSH.Modules.Appointments.Features.v1.Doctors.UpdateDoctor;
using FSH.Modules.Appointments.Features.v1.Timetable.GetTimetable;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Microsoft.Extensions.Hosting;

[assembly: FshModule(typeof(FSH.Modules.Appointments.AppointmentsModule), 1020)]

namespace FSH.Modules.Appointments;

/// <summary>
/// Visiting doctors, their weekly days and the timetable built from them; patients' tokens in each sitting; the
/// consultation fee taken on arrival and the doctor's share of it, paid out later. Fees and payouts reach Accounting
/// as integration events through the outbox.
/// </summary>
public sealed class AppointmentsModule : IModule
{
    public void ConfigureServices(IHostApplicationBuilder builder)
    {
        ArgumentNullException.ThrowIfNull(builder);

        PermissionConstants.Register(AppointmentsPermissions.All);

        builder.Services.AddHeroDbContext<AppointmentsDbContext>();
        builder.Services.AddScoped<IDbInitializer, AppointmentsDbInitializer>();
        builder.Services.TryAddSingleton(TimeProvider.System);

        builder.Services.AddHealthChecks()
            .AddDbContextCheck<AppointmentsDbContext>(
                name: "db:appointments",
                failureStatus: HealthStatus.Unhealthy);
    }

    public void ConfigureMiddleware(IApplicationBuilder app)
    {
        // No custom middleware needed
    }

    public void MapEndpoints(IEndpointRouteBuilder endpoints)
    {
        ArgumentNullException.ThrowIfNull(endpoints);

        var versionSet = endpoints.NewApiVersionSet()
            .HasApiVersion(new ApiVersion(1))
            .ReportApiVersions()
            .Build();

        var group = endpoints
            .MapGroup("api/v{version:apiVersion}/appointments")
            .WithTags("Appointments")
            .WithApiVersionSet(versionSet)
            .RequireAuthorization();

        group.MapCreateDoctorEndpoint();
        group.MapUpdateDoctorEndpoint();
        group.MapSetDoctorActiveEndpoint();
        group.MapGetDoctorByIdEndpoint();
        group.MapSearchDoctorsEndpoint();
        group.MapSetDoctorWeeklySlotsEndpoint();
        group.MapAddDoctorDayChangeEndpoint();
        group.MapRemoveDoctorDayChangeEndpoint();

        group.MapGetTimetableEndpoint();

        group.MapGetDaySheetEndpoint();
        group.MapSearchAppointmentsEndpoint();
        group.MapGetAppointmentByIdEndpoint();
        group.MapCreateBookingEndpoint();
        group.MapMarkAppointmentArrivedEndpoint();
        group.MapMarkAppointmentSeenEndpoint();
        group.MapMarkAppointmentNoShowEndpoint();
        group.MapCancelAppointmentEndpoint();

        group.MapGetDoctorBalanceEndpoint();
        group.MapCreateDoctorPayoutEndpoint();
        group.MapSearchDoctorPayoutsEndpoint();
    }
}
