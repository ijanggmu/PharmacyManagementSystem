using FSH.Modules.Purchasing.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace FSH.Modules.Purchasing.Data.Configurations;

public sealed class DirectGoodsReceiptConfiguration : IEntityTypeConfiguration<DirectGoodsReceipt>
{
    public void Configure(EntityTypeBuilder<DirectGoodsReceipt> builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        builder.ToTable("DirectGoodsReceipts");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Status).HasConversion<string>().HasMaxLength(16);
        builder.Property(x => x.Source).HasConversion<string>().HasMaxLength(16);
        builder.Property(x => x.SupplierInvoiceNumber).HasMaxLength(128);
        builder.Property(x => x.ReceiptNumber).HasMaxLength(64);
        builder.Property(x => x.CreatedBy).HasMaxLength(128);
        builder.Property(x => x.VoidedBy).HasMaxLength(128);
        builder.Property(x => x.VoidReason).HasMaxLength(512);
        builder.Property(x => x.BillDiscountPercent).HasPrecision(9, 4);
        builder.Property(x => x.BillDiscountAmount).HasPrecision(18, 2);
        builder.Ignore(x => x.SubtotalAmount);
        builder.Ignore(x => x.LineDiscountAmount);
        builder.Ignore(x => x.NetAmount);
        builder.Ignore(x => x.VatAmount);
        builder.Ignore(x => x.GrossAmount);

        builder.Property(x => x.BranchId).IsRequired();

        builder.HasIndex(x => x.SupplierId);
        builder.HasIndex(x => x.Status);
        builder.HasIndex(x => x.ReceiptDateUtc);
        builder.HasIndex(x => x.BranchId);
        builder.HasIndex(x => x.PurchaseOrderId);
        builder.HasIndex(x => x.Source);
        // TenantId is Finbuckle's shadow column — declared so the receipt-number index can include it.
        builder.Property<string>("TenantId").IsRequired();
        builder.HasIndex("TenantId", nameof(DirectGoodsReceipt.ReceiptNumber))
            .IsUnique()
            .HasFilter("\"ReceiptNumber\" IS NOT NULL");
        builder.HasIndex(x => new { x.BranchId, x.FiscalYear });

        builder.HasMany(x => x.Lines)
            .WithOne()
            .HasForeignKey(l => l.DirectGoodsReceiptId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.Navigation(x => x.Lines).UsePropertyAccessMode(PropertyAccessMode.Field);

        builder.Ignore(x => x.DomainEvents);
    }
}
