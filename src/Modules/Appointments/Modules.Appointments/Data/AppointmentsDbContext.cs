using Finbuckle.MultiTenant.Abstractions;
using FSH.Framework.Persistence.Context;
using FSH.Framework.Shared.Multitenancy;
using FSH.Framework.Shared.Persistence;
using FSH.Modules.Appointments.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;

namespace FSH.Modules.Appointments.Data;

public sealed class AppointmentsDbContext : BaseDbContext
{
    public const string Schema = "appointments";

    public AppointmentsDbContext(
        IMultiTenantContextAccessor<AppTenantInfo> multiTenantContextAccessor,
        DbContextOptions<AppointmentsDbContext> options,
        IOptions<DatabaseOptions> settings,
        IHostEnvironment environment) : base(multiTenantContextAccessor, options, settings, environment) { }

    public DbSet<Doctor> Doctors => Set<Doctor>();
    public DbSet<DoctorWeeklySlot> DoctorWeeklySlots => Set<DoctorWeeklySlot>();
    public DbSet<DoctorDayChange> DoctorDayChanges => Set<DoctorDayChange>();
    public DbSet<DoctorSession> DoctorSessions => Set<DoctorSession>();
    public DbSet<Appointment> Appointments => Set<Appointment>();
    public DbSet<DoctorPayout> DoctorPayouts => Set<DoctorPayout>();
    public DbSet<AppointmentSettings> AppointmentSettings => Set<AppointmentSettings>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        ArgumentNullException.ThrowIfNull(modelBuilder);
        modelBuilder.HasDefaultSchema(Schema);
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(AppointmentsDbContext).Assembly);
        base.OnModelCreating(modelBuilder);
    }
}
