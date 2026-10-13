using FSH.Modules.Sales.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace FSH.Modules.Sales.Data.Configurations;

public sealed class SaleItemConfiguration : IEntityTypeConfiguration<SaleItem>
{
    public void Configure(EntityTypeBuilder<SaleItem> builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        builder.ToTable("SaleItems");
        builder.HasKey(x => x.Id);

        // Reached only through Sale.Items nav collection — same nav-child footgun as
        // AccountingVoucherLine/PurchaseOrderLine/PrescriptionItem (database.md).
        builder.Property(x => x.Id).ValueGeneratedNever();

        builder.Property(x => x.BranchId).IsRequired();
        builder.Property(x => x.Quantity).HasPrecision(18, 3);
        builder.Property(x => x.UnitPrice).HasPrecision(18, 2);
        builder.Property(x => x.DiscountAmount).HasPrecision(18, 2);
        builder.Property(x => x.DiscountPercent).HasPrecision(5, 2).HasDefaultValue(0m);
        builder.Property(x => x.UnitCostPrice).HasPrecision(18, 2);
        // Existing rows predate per-line VAT status; they were all taxed, so default true.
        builder.Property(x => x.IsTaxable).HasDefaultValue(true);
        builder.Property(x => x.BatchNo).HasMaxLength(100);
        // Pack the line was sold in (display snapshot; Quantity stays in base units). Null = sold in base units.
        builder.Property(x => x.SoldPackLabel).HasMaxLength(SaleItemPackUnit.MaxLabelLength);
        builder.Property(x => x.BaseUnitLabel).HasMaxLength(SaleItemPackUnit.MaxLabelLength);
        builder.Ignore(x => x.PackQuantity);
        builder.Ignore(x => x.LineTotal);

        builder.HasIndex(x => x.SaleId);
        builder.HasIndex(x => x.MedicineId);
        builder.HasIndex(x => x.BranchId);
        builder.Ignore(x => x.DomainEvents);
    }
}
