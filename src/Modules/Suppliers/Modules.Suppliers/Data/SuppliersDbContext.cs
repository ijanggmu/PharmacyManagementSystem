using Finbuckle.MultiTenant.Abstractions;
using FSH.Framework.Persistence.Context;
using FSH.Framework.Shared.Multitenancy;
using FSH.Framework.Shared.Persistence;
using FSH.Modules.Suppliers.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;

namespace FSH.Modules.Suppliers.Data;

public sealed class SuppliersDbContext : BaseDbContext
{
    public const string Schema = "suppliers";

    public SuppliersDbContext(
        IMultiTenantContextAccessor<AppTenantInfo> multiTenantContextAccessor,
        DbContextOptions<SuppliersDbContext> options,
        IOptions<DatabaseOptions> settings,
        IHostEnvironment environment) : base(multiTenantContextAccessor, options, settings, environment) { }

    public DbSet<Supplier> Suppliers => Set<Supplier>();
    public DbSet<SupplierLedgerEntry> SupplierLedgerEntries => Set<SupplierLedgerEntry>();
    public DbSet<SupplierReturn> SupplierReturns => Set<SupplierReturn>();
    public DbSet<SupplierReturnItem> SupplierReturnItems => Set<SupplierReturnItem>();
    public DbSet<SupplierNumberSequence> NumberSequences => Set<SupplierNumberSequence>();
    public DbSet<ExpiryClaim> ExpiryClaims => Set<ExpiryClaim>();
    public DbSet<ExpiryClaimLine> ExpiryClaimLines => Set<ExpiryClaimLine>();
    public DbSet<SupplierPriceListItem> SupplierPriceListItems => Set<SupplierPriceListItem>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        ArgumentNullException.ThrowIfNull(modelBuilder);
        modelBuilder.HasDefaultSchema(Schema);
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(SuppliersDbContext).Assembly);
        base.OnModelCreating(modelBuilder);
    }
}
