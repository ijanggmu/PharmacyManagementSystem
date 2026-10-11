using FSH.Modules.Sales.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace FSH.Modules.Sales.Data.Configurations;

public sealed class SaleRefundItemConfiguration : IEntityTypeConfiguration<SaleRefundItem>
{
    public void Configure(EntityTypeBuilder<SaleRefundItem> builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        builder.ToTable("SaleRefundItems");
        builder.HasKey(x => x.Id);

        // Reached only through SaleRefund.Items nav collection — same nav-child footgun as
        // SaleItem/SaleReturnItem (database.md).
        builder.Property(x => x.Id).ValueGeneratedNever();

        builder.Property(x => x.QuantityRefunded).HasPrecision(18, 3);
        builder.Property(x => x.UnitPrice).HasPrecision(18, 2);
        builder.Property(x => x.LineAmount).HasPrecision(18, 2);
        builder.Ignore(x => x.TotalRefundAmount);

        builder.HasIndex(x => x.SaleRefundId);
        builder.HasIndex(x => x.SaleItemId);
        builder.HasIndex(x => x.MedicineId);
        builder.Ignore(x => x.DomainEvents);
    }
}
