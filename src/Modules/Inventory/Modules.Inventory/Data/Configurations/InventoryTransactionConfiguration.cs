using FSH.Modules.Inventory.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace FSH.Modules.Inventory.Data.Configurations;

public sealed class InventoryTransactionConfiguration : IEntityTypeConfiguration<InventoryTransaction>
{
    public void Configure(EntityTypeBuilder<InventoryTransaction> builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        builder.ToTable("InventoryTransactions");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Type).HasConversion<string>().HasMaxLength(32);
        builder.Property(x => x.QuantityDelta).HasPrecision(18, 3);
        builder.Property(x => x.UnitCostPrice).HasPrecision(18, 2);
        builder.Property(x => x.ReferenceType).HasMaxLength(64);
        builder.Property(x => x.Notes).HasMaxLength(512);
        builder.HasIndex(x => x.MedicineId);
        builder.HasIndex(x => x.MedicineBatchId);
        builder.HasIndex(x => new { x.ReferenceType, x.ReferenceId });
        builder.HasIndex(x => x.BranchId);
        builder.Ignore(x => x.DomainEvents);
    }
}
