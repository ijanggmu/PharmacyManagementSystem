using FSH.Modules.Purchasing.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace FSH.Modules.Purchasing.Data.Configurations;

public sealed class PurchaseOrderLineConfiguration : IEntityTypeConfiguration<PurchaseOrderLine>
{
    public void Configure(EntityTypeBuilder<PurchaseOrderLine> builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        builder.ToTable("PurchaseOrderLines");
        builder.HasKey(x => x.Id);

        // Reached only through PurchaseOrder.Lines nav collection — same nav-child footgun as
        // AccountingVoucherLine (database.md).
        builder.Property(x => x.Id).ValueGeneratedNever();

        builder.Property(x => x.BatchNo).HasMaxLength(64);
        builder.Property(x => x.Quantity).HasPrecision(18, 3);
        builder.Property(x => x.UnitCostPrice).HasPrecision(18, 2);
        builder.Property(x => x.SellingPrice).HasPrecision(18, 2);
        builder.Property(x => x.RackLocation).HasMaxLength(64);
        builder.Property(x => x.VatAmount).HasPrecision(18, 2);
        builder.Property(x => x.FreeQuantity).HasPrecision(18, 3);
        builder.Property(x => x.DiscountPercent).HasPrecision(9, 4);
        builder.Property(x => x.DiscountAmount).HasPrecision(18, 2);
        builder.Property(x => x.BillDiscountAmount).HasPrecision(18, 2);
        builder.Property(x => x.PackSize).HasPrecision(18, 3);
        builder.Property(x => x.PackUnitCost).HasPrecision(18, 2);
        builder.Ignore(x => x.GrossAmount);
        builder.Ignore(x => x.DiscountedAmount);
        builder.Ignore(x => x.NetAmount);
        builder.Ignore(x => x.ReceivedQuantity);
        builder.Ignore(x => x.EffectiveUnitCost);
        builder.HasIndex(x => x.PurchaseOrderId);
        builder.HasIndex(x => x.MedicineId);
        builder.Ignore(x => x.DomainEvents);
    }
}
