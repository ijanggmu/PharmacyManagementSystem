using FSH.Modules.Prescriptions.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace FSH.Modules.Prescriptions.Data.Configurations;

public sealed class PrescriptionRefillConfiguration : IEntityTypeConfiguration<PrescriptionRefill>
{
    public void Configure(EntityTypeBuilder<PrescriptionRefill> builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        builder.ToTable("PrescriptionRefills");
        builder.HasKey(x => x.Id);

        // Reached only through Prescription.Refills nav collection — same nav-child footgun as
        // PrescriptionItem (database.md).
        builder.Property(x => x.Id).ValueGeneratedNever();

        builder.Property(x => x.QuantityDispensed).HasPrecision(18, 3);
        builder.Property(x => x.Notes).HasMaxLength(1000);

        builder.HasIndex(x => x.PrescriptionId);
        builder.HasIndex(x => x.PrescriptionItemId);
        builder.HasIndex(x => x.MedicineId);
        builder.HasIndex(x => x.RefilledAtUtc);
        builder.Ignore(x => x.DomainEvents);
    }
}
