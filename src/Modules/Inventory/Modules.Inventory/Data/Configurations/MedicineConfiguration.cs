using FSH.Modules.Inventory.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace FSH.Modules.Inventory.Data.Configurations;

public sealed class MedicineConfiguration : IEntityTypeConfiguration<Medicine>
{
    public void Configure(EntityTypeBuilder<Medicine> builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        builder.ToTable("Medicines");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Name).IsRequired().HasMaxLength(256);
        builder.Property(x => x.GenericName).HasMaxLength(256);
        builder.Property(x => x.ReorderLevel).HasPrecision(18, 2);
        builder.Property(x => x.UnitPrice).HasPrecision(18, 2);
        builder.Property(x => x.CostPrice).HasPrecision(18, 2);
        builder.Property(x => x.MaximumStock).HasPrecision(18, 2);
        builder.Property(x => x.PrescriptionRequired).HasDefaultValue(false);
        builder.Property(x => x.Form).HasMaxLength(64);
        builder.Property(x => x.Strength).HasMaxLength(64);
        builder.Property(x => x.Barcode).HasMaxLength(64);
        builder.Property(x => x.Description).HasMaxLength(2000);
        builder.Property(x => x.DeletedBy).HasMaxLength(64);
        builder.Property(x => x.BrandName).HasMaxLength(200);
        builder.Property(x => x.Dosage).HasMaxLength(200);
        builder.Property(x => x.SideEffects).HasMaxLength(2000);
        builder.Property(x => x.StorageInstructions).HasMaxLength(2000);
        builder.Property(x => x.StorageTempMinC).HasPrecision(18, 2);
        builder.Property(x => x.StorageTempMaxC).HasPrecision(18, 2);
        builder.Property(x => x.RequiresColdChain).HasDefaultValue(false);
        builder.Property(x => x.UnitLabel).HasMaxLength(50);
        builder.Property(x => x.ControlledSchedule).HasMaxLength(20);
        builder.Property(x => x.IsTaxable).HasDefaultValue(true);
        builder.Property(x => x.SupplierInvoiceNumber).HasMaxLength(100);
        builder.Property(x => x.VatAmount).HasPrecision(18, 2);
        builder.HasIndex(x => x.Name);
        builder.HasIndex(x => x.CategoryId);
        builder.HasIndex(x => x.IsDeleted);
        builder.Ignore(x => x.DomainEvents);
    }
}
