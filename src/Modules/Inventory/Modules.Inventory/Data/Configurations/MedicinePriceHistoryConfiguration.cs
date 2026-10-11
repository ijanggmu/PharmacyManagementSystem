using FSH.Modules.Inventory.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace FSH.Modules.Inventory.Data.Configurations;

public sealed class MedicinePriceHistoryConfiguration : IEntityTypeConfiguration<MedicinePriceHistory>
{
    public void Configure(EntityTypeBuilder<MedicinePriceHistory> builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        builder.ToTable("MedicinePriceHistories");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.UnitPrice).HasPrecision(10, 2);
        builder.Property(x => x.CostPrice).HasPrecision(10, 2);
        builder.Property(x => x.Reason).HasMaxLength(500);
        builder.Property(x => x.Status).HasConversion<int>();
        builder.HasIndex(x => new { x.MedicineId, x.EffectiveFrom });

        // At most one 'Active' and one 'Scheduled' row per medicine at a time — mirrors the
        // source's ux_medicine_price_history_one_active/one_scheduled partial unique indexes.
        builder.HasIndex(x => x.MedicineId)
            .IsUnique()
            .HasFilter("\"Status\" = 1")
            .HasDatabaseName("IX_MedicinePriceHistories_MedicineId_OneActive");
        builder.HasIndex(x => x.MedicineId)
            .IsUnique()
            .HasFilter("\"Status\" = 0")
            .HasDatabaseName("IX_MedicinePriceHistories_MedicineId_OneScheduled");

        builder.Ignore(x => x.DomainEvents);
    }
}
