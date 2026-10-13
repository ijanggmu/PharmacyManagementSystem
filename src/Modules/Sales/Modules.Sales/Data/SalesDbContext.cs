using Finbuckle.MultiTenant.Abstractions;
using FSH.Framework.Persistence.Context;
using FSH.Framework.Shared.Multitenancy;
using FSH.Framework.Shared.Persistence;
using FSH.Modules.Sales.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;

namespace FSH.Modules.Sales.Data;

public sealed class SalesDbContext : BaseDbContext
{
    public const string Schema = "sales";

    public SalesDbContext(
        IMultiTenantContextAccessor<AppTenantInfo> multiTenantContextAccessor,
        DbContextOptions<SalesDbContext> options,
        IOptions<DatabaseOptions> settings,
        IHostEnvironment environment) : base(multiTenantContextAccessor, options, settings, environment) { }

    public DbSet<Sale> Sales => Set<Sale>();
    public DbSet<SaleItem> SaleItems => Set<SaleItem>();
    public DbSet<CashShift> CashShifts => Set<CashShift>();
    public DbSet<SaleReturn> SaleReturns => Set<SaleReturn>();
    public DbSet<SaleReturnItem> SaleReturnItems => Set<SaleReturnItem>();
    public DbSet<SaleRefund> SaleRefunds => Set<SaleRefund>();
    public DbSet<SaleRefundItem> SaleRefundItems => Set<SaleRefundItem>();
    public DbSet<IrdInvoiceQueueEntry> IrdInvoiceQueues => Set<IrdInvoiceQueueEntry>();
    public DbSet<PaymentSettings> PaymentSettings => Set<PaymentSettings>();
    public DbSet<IrdSettings> IrdSettings => Set<IrdSettings>();
    public DbSet<FonepayQrRequest> FonepayQrRequests => Set<FonepayQrRequest>();
    public DbSet<InvoiceNumberSequence> InvoiceNumberSequences => Set<InvoiceNumberSequence>();
    public DbSet<SalePrint> SalePrints => Set<SalePrint>();
    public DbSet<RefundPrint> RefundPrints => Set<RefundPrint>();
    public DbSet<PriceLevel> PriceLevels => Set<PriceLevel>();
    public DbSet<PriceLevelItem> PriceLevelItems => Set<PriceLevelItem>();
    public DbSet<CustomerPriceLevel> CustomerPriceLevels => Set<CustomerPriceLevel>();
    public DbSet<ParkedSale> ParkedSales => Set<ParkedSale>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        ArgumentNullException.ThrowIfNull(modelBuilder);
        modelBuilder.HasDefaultSchema(Schema);
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(SalesDbContext).Assembly);
        base.OnModelCreating(modelBuilder);
    }
}
