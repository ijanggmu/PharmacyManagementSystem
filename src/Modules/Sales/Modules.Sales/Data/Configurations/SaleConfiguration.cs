using FSH.Modules.Sales.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace FSH.Modules.Sales.Data.Configurations;

public sealed class SaleConfiguration : IEntityTypeConfiguration<Sale>
{
    public const int MaxClientRequestIdLength = 100;
    public const string ClientRequestIdIndexName = "UX_Sales_TenantId_ClientRequestId";
    public const int MaxBuyerNameLength = 200;
    public const int MaxBuyerPanLength = 20;

    public void Configure(EntityTypeBuilder<Sale> builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        builder.ToTable("Sales");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.BranchId).IsRequired();
        builder.Property(x => x.Status).HasConversion<string>().HasMaxLength(16);
        builder.Property(x => x.PaymentMethod).HasMaxLength(32);
        builder.Property(x => x.BalanceDue).HasPrecision(18, 2).HasDefaultValue(0m);
        builder.Property(x => x.Notes).HasMaxLength(1024);
        builder.Property(x => x.CancelReason).HasMaxLength(512);
        builder.Property(x => x.InvoiceNumber).HasMaxLength(100);
        builder.Property(x => x.BuyerName).HasMaxLength(MaxBuyerNameLength);
        builder.Property(x => x.BuyerPan).HasMaxLength(MaxBuyerPanLength);
        builder.Property(x => x.IrdStatus).HasConversion<string>().HasMaxLength(16);
        builder.Property(x => x.IrdInvoiceId).HasMaxLength(150);
        builder.Property(x => x.IrdError).HasMaxLength(2000);
        builder.Property(x => x.VatRatePercent).HasPrecision(5, 2);
        builder.Property(x => x.TaxableAmount).HasPrecision(18, 2);
        builder.Property(x => x.VatAmount).HasPrecision(18, 2);
        builder.Property(x => x.ExemptAmount).HasPrecision(18, 2);
        builder.Ignore(x => x.TotalAmount);
        builder.Ignore(x => x.TotalDiscount);

        // TenantId is Finbuckle's shadow column — declared so the invoice-number index can include it.
        builder.Property<string>("TenantId").IsRequired();

        builder.HasIndex(x => x.BranchId);
        builder.HasIndex(x => x.CustomerId);
        builder.HasIndex(x => x.Status);
        builder.HasIndex(x => x.SaleDateUtc);
        // Unique per tenant, not globally: tenants share a database and sequential numbers
        // (INV-MAIN-2083/84-00001) would otherwise collide across pharmacies.
        builder.HasIndex("TenantId", nameof(Sale.InvoiceNumber)).IsUnique().HasFilter("\"InvoiceNumber\" IS NOT NULL");
        builder.HasIndex(x => new { x.BranchId, x.FiscalYear });
        builder.Property(x => x.ClientRequestId).HasMaxLength(MaxClientRequestIdLength);
        // One sale per checkout key per tenant: a timed-out request retried, or an offline sale replayed,
        // with the same key can never create a second sale (CreateSaleCommandHandler returns the first).
        builder.HasIndex("TenantId", nameof(Sale.ClientRequestId))
            .IsUnique()
            .HasFilter("\"ClientRequestId\" IS NOT NULL")
            .HasDatabaseName(ClientRequestIdIndexName);
        builder.HasIndex(x => x.IrdStatus);

        builder.HasMany(x => x.Items)
            .WithOne()
            .HasForeignKey(i => i.SaleId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.Navigation(x => x.Items).UsePropertyAccessMode(PropertyAccessMode.Field);

        builder.HasMany(x => x.Payments)
            .WithOne()
            .HasForeignKey(p => p.SaleId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.Navigation(x => x.Payments).UsePropertyAccessMode(PropertyAccessMode.Field);

        builder.Property(x => x.PaymentAmount).HasPrecision(18, 2);
        builder.HasIndex(x => x.PrescriptionId);
        builder.Ignore(x => x.DomainEvents);
    }
}
