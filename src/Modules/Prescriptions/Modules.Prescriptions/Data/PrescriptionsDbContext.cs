using Finbuckle.MultiTenant.Abstractions;
using FSH.Framework.Persistence.Context;
using FSH.Framework.Shared.Multitenancy;
using FSH.Framework.Shared.Persistence;
using FSH.Modules.Prescriptions.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;

namespace FSH.Modules.Prescriptions.Data;

public sealed class PrescriptionsDbContext : BaseDbContext
{
    public const string Schema = "prescriptions";

    public PrescriptionsDbContext(
        IMultiTenantContextAccessor<AppTenantInfo> multiTenantContextAccessor,
        DbContextOptions<PrescriptionsDbContext> options,
        IOptions<DatabaseOptions> settings,
        IHostEnvironment environment) : base(multiTenantContextAccessor, options, settings, environment) { }

    public DbSet<Prescription> Prescriptions => Set<Prescription>();
    public DbSet<PrescriptionItem> PrescriptionItems => Set<PrescriptionItem>();
    public DbSet<PrescriptionRefill> PrescriptionRefills => Set<PrescriptionRefill>();
    public DbSet<PrescriptionDispenseReversal> PrescriptionDispenseReversals => Set<PrescriptionDispenseReversal>();
    public DbSet<PrescriptionNumberSequence> PrescriptionNumberSequences => Set<PrescriptionNumberSequence>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        ArgumentNullException.ThrowIfNull(modelBuilder);
        modelBuilder.HasDefaultSchema(Schema);
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(PrescriptionsDbContext).Assembly);
        base.OnModelCreating(modelBuilder);
    }
}
