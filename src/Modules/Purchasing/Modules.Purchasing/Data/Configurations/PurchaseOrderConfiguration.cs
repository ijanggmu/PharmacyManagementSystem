using FSH.Modules.Purchasing.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace FSH.Modules.Purchasing.Data.Configurations;

public sealed class PurchaseOrderConfiguration : IEntityTypeConfiguration<PurchaseOrder>
{
    public void Configure(EntityTypeBuilder<PurchaseOrder> builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        builder.ToTable("PurchaseOrders");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Status).HasConversion<string>().HasMaxLength(16);
        builder.Property(x => x.Narration).HasMaxLength(1024);
        builder.Property(x => x.ApprovedBy).HasMaxLength(128);
        builder.Property(x => x.ReceivedBy).HasMaxLength(128);
        builder.Property(x => x.CancelReason).HasMaxLength(512);
        builder.Property(x => x.SupplierInvoiceNumber).HasMaxLength(64);
        builder.Property(x => x.BillDiscountPercent).HasPrecision(9, 4);
        builder.Property(x => x.BillDiscountAmount).HasPrecision(18, 2);
        builder.Ignore(x => x.TotalAmount);
        builder.Ignore(x => x.TotalVatAmount);
        builder.Ignore(x => x.SubtotalAmount);
        builder.Ignore(x => x.LineDiscountAmount);

        builder.HasIndex(x => x.SupplierId);
        builder.HasIndex(x => x.Status);
        builder.HasIndex(x => x.OrderDateUtc);
        builder.HasIndex(x => x.BranchId);

        builder.HasMany(x => x.Lines)
            .WithOne()
            .HasForeignKey(l => l.PurchaseOrderId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.Navigation(x => x.Lines).UsePropertyAccessMode(PropertyAccessMode.Field);

        builder.Ignore(x => x.DomainEvents);
    }
}
