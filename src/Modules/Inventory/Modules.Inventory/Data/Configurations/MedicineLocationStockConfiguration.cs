using FSH.Modules.Inventory.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace FSH.Modules.Inventory.Data.Configurations;

public sealed class MedicineLocationStockConfiguration : IEntityTypeConfiguration<MedicineLocationStock>
{
    public void Configure(EntityTypeBuilder<MedicineLocationStock> builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        builder.ToTable("MedicineLocationStocks");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.QuantityOnHand).HasPrecision(18, 3);

        // One stock row per (medicine, location) — mirrors the source system's unique
        // medicine_branch_stock(branch_id, medicine_id) constraint.
        builder.HasIndex(x => new { x.MedicineId, x.LocationId }).IsUnique();

        builder.Ignore(x => x.DomainEvents);
    }
}
