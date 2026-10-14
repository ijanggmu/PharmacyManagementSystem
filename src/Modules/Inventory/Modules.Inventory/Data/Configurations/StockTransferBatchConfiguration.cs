using FSH.Modules.Inventory.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace FSH.Modules.Inventory.Data.Configurations;

public sealed class StockTransferBatchConfiguration : IEntityTypeConfiguration<StockTransferBatch>
{
    public void Configure(EntityTypeBuilder<StockTransferBatch> builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        builder.ToTable("StockTransferBatches");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.BatchNo).IsRequired().HasMaxLength(64);
        builder.Property(x => x.Quantity).HasPrecision(18, 3);
        builder.Property(x => x.CostPrice).HasPrecision(18, MedicineBatch.CostDecimals);
        builder.Property(x => x.SellingPrice).HasPrecision(18, 2);
        builder.HasIndex(x => x.StockTransferId);
        builder.HasOne<StockTransfer>().WithMany().HasForeignKey(x => x.StockTransferId).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne<MedicineBatch>().WithMany().HasForeignKey(x => x.SourceBatchId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<Medicine>().WithMany().HasForeignKey(x => x.MedicineId).OnDelete(DeleteBehavior.Restrict);
        builder.Ignore(x => x.DomainEvents);
    }
}
