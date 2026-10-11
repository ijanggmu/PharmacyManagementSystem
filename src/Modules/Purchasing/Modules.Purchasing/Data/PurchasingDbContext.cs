using Finbuckle.MultiTenant.Abstractions;
using FSH.Framework.Persistence.Context;
using FSH.Framework.Shared.Multitenancy;
using FSH.Framework.Shared.Persistence;
using FSH.Modules.Purchasing.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;

namespace FSH.Modules.Purchasing.Data;

public sealed class PurchasingDbContext : BaseDbContext
{
    public const string Schema = "purchasing";

    public PurchasingDbContext(
        IMultiTenantContextAccessor<AppTenantInfo> multiTenantContextAccessor,
        DbContextOptions<PurchasingDbContext> options,
        IOptions<DatabaseOptions> settings,
        IHostEnvironment environment) : base(multiTenantContextAccessor, options, settings, environment) { }

    public DbSet<PurchaseOrder> PurchaseOrders => Set<PurchaseOrder>();
    public DbSet<PurchaseOrderLine> PurchaseOrderLines => Set<PurchaseOrderLine>();
    public DbSet<DirectGoodsReceipt> DirectGoodsReceipts => Set<DirectGoodsReceipt>();
    public DbSet<DirectGoodsReceiptLine> DirectGoodsReceiptLines => Set<DirectGoodsReceiptLine>();
    public DbSet<PurchasingNumberSequence> NumberSequences => Set<PurchasingNumberSequence>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        ArgumentNullException.ThrowIfNull(modelBuilder);
        modelBuilder.HasDefaultSchema(Schema);
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(PurchasingDbContext).Assembly);
        base.OnModelCreating(modelBuilder);
    }
}
