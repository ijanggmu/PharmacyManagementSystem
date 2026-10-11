using FSH.Modules.Inventory.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace FSH.Modules.Inventory.Data.Configurations;

public sealed class MedicineBatchConfiguration : IEntityTypeConfiguration<MedicineBatch>
{
    public void Configure(EntityTypeBuilder<MedicineBatch> builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        builder.ToTable("MedicineBatches");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.BatchNo).IsRequired().HasMaxLength(64);
        builder.Property(x => x.QuantityOnHand).HasPrecision(18, 3);
        builder.Property(x => x.InitialQuantity).HasPrecision(18, 3);
        builder.Property(x => x.CostPrice).HasPrecision(18, 2);
        builder.Property(x => x.SellingPrice).HasPrecision(18, 2);
        builder.Property(x => x.RackLocation).HasMaxLength(64);
        builder.Property(x => x.IsRecalled).HasDefaultValue(false);
        builder.Property(x => x.RecallReason).HasMaxLength(500);

        // A batch number is unique among live rows per medicine per branch. Branch is part of the key so the
        // same lot can exist at two branches after a stock transfer (StockTransferBatch keeps batch numbers).
        builder.HasIndex(x => new { x.MedicineId, x.BranchId, x.BatchNo }).IsUnique().HasFilter("\"IsDisposed\" = FALSE");
        builder.HasIndex(x => x.MedicineId);
        builder.HasIndex(x => x.ExpiryDate);
        builder.HasIndex(x => x.BranchId);
        builder.HasOne<Medicine>().WithMany().HasForeignKey(x => x.MedicineId).OnDelete(DeleteBehavior.Restrict);
        builder.Ignore(x => x.DomainEvents);
    }
}
