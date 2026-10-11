using FSH.Modules.Prescriptions.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace FSH.Modules.Prescriptions.Data.Configurations;

public sealed class PrescriptionItemConfiguration : IEntityTypeConfiguration<PrescriptionItem>
{
    public void Configure(EntityTypeBuilder<PrescriptionItem> builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        builder.ToTable("PrescriptionItems");
        builder.HasKey(x => x.Id);

        // Reached only through Prescription.Items nav collection — same nav-child footgun as
        // AccountingVoucherLine/PurchaseOrderLine (database.md).
        builder.Property(x => x.Id).ValueGeneratedNever();

        builder.Property(x => x.PrescribedQuantity).HasPrecision(18, 3);
        builder.Property(x => x.DispensedQuantity).HasPrecision(18, 3);
        builder.Ignore(x => x.RemainingQuantity);
        builder.Property(x => x.DosageInstructions).HasMaxLength(1000);

        // Maps onto Postgres' xmin system column (no real column): concurrent read-modify-writes of
        // DispensedQuantity/RefillsUsed fail with DbUpdateConcurrencyException instead of losing an update.
        builder.Property(x => x.RowVersion).IsRowVersion();

        builder.HasIndex(x => x.PrescriptionId);
        builder.HasIndex(x => x.MedicineId);
        builder.Ignore(x => x.DomainEvents);
    }
}
