using FSH.Modules.Sales.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace FSH.Modules.Sales.Data.Configurations;

public sealed class SaleReturnItemConfiguration : IEntityTypeConfiguration<SaleReturnItem>
{
    public void Configure(EntityTypeBuilder<SaleReturnItem> builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        builder.ToTable("SaleReturnItems");
        builder.HasKey(x => x.Id);

        // Reached only through SaleReturn.Items nav collection — same nav-child footgun as
        // SaleItem/AccountingVoucherLine (database.md).
        builder.Property(x => x.Id).ValueGeneratedNever();

        builder.Property(x => x.QuantityReturned).HasPrecision(18, 3);
        builder.Property(x => x.UnitPrice).HasPrecision(18, 2);
        builder.Property(x => x.UnitCostPrice).HasPrecision(18, 2);
        builder.Property(x => x.Reason).HasMaxLength(512);
        builder.Property(x => x.PackagingCondition).HasConversion<string>().HasMaxLength(16);
        builder.Ignore(x => x.TotalAmount);

        builder.HasIndex(x => x.SaleReturnId);
        builder.HasIndex(x => x.SaleItemId);
        builder.HasIndex(x => x.MedicineId);
        builder.Ignore(x => x.DomainEvents);
    }
}
