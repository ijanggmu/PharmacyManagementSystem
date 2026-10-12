using FSH.Modules.Inventory.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace FSH.Modules.Inventory.Data.Configurations;

public sealed class ConsignmentPositionConfiguration : IEntityTypeConfiguration<ConsignmentPosition>
{
    public void Configure(EntityTypeBuilder<ConsignmentPosition> builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        builder.ToTable("ConsignmentPositions");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.BatchNo).HasMaxLength(128);

        builder.HasIndex(x => x.SupplierId);
        builder.HasIndex(x => x.BatchId);
        builder.HasIndex(x => x.BranchId);

        builder.Property(x => x.QuantityReceived).HasPrecision(18, 3);
        builder.Property(x => x.SettledQuantity).HasPrecision(18, 3);
        builder.Property(x => x.UnitCostPrice).HasPrecision(18, 2);
        builder.HasOne<MedicineBatch>().WithMany().HasForeignKey(x => x.BatchId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<Medicine>().WithMany().HasForeignKey(x => x.MedicineId).OnDelete(DeleteBehavior.Restrict);
        builder.Ignore(x => x.DomainEvents);
    }
}
