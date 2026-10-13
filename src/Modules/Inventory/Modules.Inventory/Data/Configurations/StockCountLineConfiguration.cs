using FSH.Modules.Inventory.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace FSH.Modules.Inventory.Data.Configurations;

public sealed class StockCountLineConfiguration : IEntityTypeConfiguration<StockCountLine>
{
    public void Configure(EntityTypeBuilder<StockCountLine> builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        builder.ToTable("StockCountLines");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.MedicineName).IsRequired().HasMaxLength(256);
        builder.Property(x => x.BatchNo).IsRequired().HasMaxLength(64);
        builder.Property(x => x.RackLocation).HasMaxLength(64);
        builder.Property(x => x.Note).HasMaxLength(512);
        builder.Property(x => x.UnitCost).HasPrecision(18, 2);
        builder.Property(x => x.SnapshotQuantity).HasPrecision(18, 3);
        builder.Property(x => x.CountedQuantity).HasPrecision(18, 3);
        builder.Property(x => x.PostedExpectedQuantity).HasPrecision(18, 3);
        builder.Property(x => x.PostedDelta).HasPrecision(18, 3);

        builder.HasIndex(x => x.SessionId);
        builder.HasIndex(x => x.BatchId);
        builder.HasOne<StockCountSession>().WithMany().HasForeignKey(x => x.SessionId).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne<Medicine>().WithMany().HasForeignKey(x => x.MedicineId).OnDelete(DeleteBehavior.Restrict);
        builder.Ignore(x => x.DomainEvents);
    }
}
