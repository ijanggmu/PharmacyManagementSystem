using FSH.Modules.Inventory.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace FSH.Modules.Inventory.Data.Configurations;

public sealed class NepalMedicineCatalogEntryConfiguration : IEntityTypeConfiguration<NepalMedicineCatalogEntry>
{
    public void Configure(EntityTypeBuilder<NepalMedicineCatalogEntry> builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        builder.ToTable("NepalMedicineCatalogEntries");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.BrandName).IsRequired().HasMaxLength(256);
        builder.Property(x => x.GenericName).HasMaxLength(256);
        builder.Property(x => x.Form).HasMaxLength(64);
        builder.Property(x => x.Strength).HasMaxLength(64);
        builder.Property(x => x.Manufacturer).HasMaxLength(256);
        builder.Property(x => x.CategoryName).HasMaxLength(128);
        builder.Property(x => x.Dosage).HasMaxLength(128);
        builder.Property(x => x.UnitPrice).HasPrecision(10, 2);
        builder.Property(x => x.CostPrice).HasPrecision(10, 2);
        builder.Property(x => x.StorageInstructions).HasMaxLength(512);
        builder.HasIndex(x => x.BrandName);
        builder.HasIndex(x => x.GenericName);
        builder.Ignore(x => x.DomainEvents);
    }
}
