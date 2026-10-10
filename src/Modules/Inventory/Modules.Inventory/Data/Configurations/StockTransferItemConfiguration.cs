using FSH.Modules.Inventory.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace FSH.Modules.Inventory.Data.Configurations;

public sealed class StockTransferItemConfiguration : IEntityTypeConfiguration<StockTransferItem>
{
    public void Configure(EntityTypeBuilder<StockTransferItem> builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        builder.ToTable("StockTransferItems");
        builder.HasKey(x => x.Id);

        // Reached only through StockTransfer.Items nav collection — same nav-child footgun as
        // Purchasing's PurchaseOrderLine (database.md).
        builder.Property(x => x.Id).ValueGeneratedNever();

        builder.Property(x => x.Quantity).HasPrecision(18, 3);
        builder.HasIndex(x => x.StockTransferId);
        builder.HasIndex(x => x.MedicineId);
        builder.Ignore(x => x.DomainEvents);
    }
}
