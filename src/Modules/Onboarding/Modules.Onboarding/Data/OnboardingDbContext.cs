using Finbuckle.MultiTenant.Abstractions;
using FSH.Framework.Persistence.Context;
using FSH.Framework.Shared.Multitenancy;
using FSH.Framework.Shared.Persistence;
using FSH.Modules.Onboarding.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;

namespace FSH.Modules.Onboarding.Data;

public sealed class OnboardingDbContext : BaseDbContext
{
    public const string Schema = "onboarding";

    public OnboardingDbContext(
        IMultiTenantContextAccessor<AppTenantInfo> multiTenantContextAccessor,
        DbContextOptions<OnboardingDbContext> options,
        IOptions<DatabaseOptions> settings,
        IHostEnvironment environment) : base(multiTenantContextAccessor, options, settings, environment) { }

    public DbSet<OnboardingStatus> OnboardingStatuses => Set<OnboardingStatus>();
    public DbSet<MigrationSession> MigrationSessions => Set<MigrationSession>();
    public DbSet<MigrationLineItem> MigrationLineItems => Set<MigrationLineItem>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        ArgumentNullException.ThrowIfNull(modelBuilder);
        modelBuilder.HasDefaultSchema(Schema);
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(OnboardingDbContext).Assembly);
        base.OnModelCreating(modelBuilder);
    }
}
