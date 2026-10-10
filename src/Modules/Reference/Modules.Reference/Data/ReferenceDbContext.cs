using Finbuckle.MultiTenant.Abstractions;
using FSH.Framework.Persistence.Context;
using FSH.Framework.Shared.Multitenancy;
using FSH.Framework.Shared.Persistence;
using FSH.Modules.Reference.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;

namespace FSH.Modules.Reference.Data;

public sealed class ReferenceDbContext : BaseDbContext
{
    public const string Schema = "reference";

    public ReferenceDbContext(
        IMultiTenantContextAccessor<AppTenantInfo> multiTenantContextAccessor,
        DbContextOptions<ReferenceDbContext> options,
        IOptions<DatabaseOptions> settings,
        IHostEnvironment environment) : base(multiTenantContextAccessor, options, settings, environment) { }

    public DbSet<MedicineCategory> MedicineCategories => Set<MedicineCategory>();
    public DbSet<PharmacySettings> PharmacySettings => Set<PharmacySettings>();
    public DbSet<TenantSetting> TenantSettings => Set<TenantSetting>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        ArgumentNullException.ThrowIfNull(modelBuilder);
        modelBuilder.HasDefaultSchema(Schema);
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(ReferenceDbContext).Assembly);
        // base.OnModelCreating runs LAST so BaseDbContext's auto-apply sees fully-configured entities.
        base.OnModelCreating(modelBuilder);
    }
}
