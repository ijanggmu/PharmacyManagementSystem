using FSH.Modules.Suppliers.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace FSH.Modules.Suppliers.Data.Configurations;

public sealed class SupplierReturnItemConfiguration : IEntityTypeConfiguration<SupplierReturnItem>
{
    public void Configure(EntityTypeBuilder<SupplierReturnItem> builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        builder.ToTable("SupplierReturnItems");
        builder.HasKey(x => x.Id);

        // Reached only through SupplierReturn.Items nav collection — same nav-child footgun as
        // SaleReturnItem/PurchaseOrderLine (database.md).
        builder.Property(x => x.Id).ValueGeneratedNever();

        builder.Property(x => x.Quantity).HasPrecision(18, 3);
        builder.Property(x => x.UnitCost).HasPrecision(18, 2);
        builder.Property(x => x.ReturnReason).HasMaxLength(256);
        builder.Property(x => x.Notes).HasMaxLength(1024);
        builder.Ignore(x => x.TotalCost);

        builder.HasIndex(x => x.SupplierReturnId);
        builder.HasIndex(x => x.MedicineId);
        builder.Ignore(x => x.DomainEvents);
    }
}
