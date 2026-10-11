using FSH.Modules.Purchasing.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace FSH.Modules.Purchasing.Data.Configurations;

public sealed class DirectGoodsReceiptLineConfiguration : IEntityTypeConfiguration<DirectGoodsReceiptLine>
{
    public void Configure(EntityTypeBuilder<DirectGoodsReceiptLine> builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        builder.ToTable("DirectGoodsReceiptLines");
        builder.HasKey(x => x.Id);

        // Reached only through DirectGoodsReceipt.Lines nav collection — same nav-child footgun as
        // PurchaseOrderLine (database.md).
        builder.Property(x => x.Id).ValueGeneratedNever();

        builder.Property(x => x.Quantity).HasPrecision(18, 3);
        builder.Property(x => x.UnitCostPrice).HasPrecision(18, 2);
        builder.Property(x => x.VatAmount).HasPrecision(18, 2);
        builder.Property(x => x.BranchId).IsRequired();
        builder.Ignore(x => x.NetAmount);

        builder.HasIndex(x => x.DirectGoodsReceiptId);
        builder.HasIndex(x => x.MedicineId);
        builder.HasIndex(x => x.BranchId);
        builder.Ignore(x => x.DomainEvents);
    }
}
