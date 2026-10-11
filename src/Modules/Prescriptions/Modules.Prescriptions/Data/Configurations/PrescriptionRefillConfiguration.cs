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

        // A sale consumes a prescription item at most once: the synchronous consumption inside the sale's
        // transaction and the SaleCompleted reconciliation can't both record it.
        builder.HasIndex(x => new { x.SaleId, x.PrescriptionItemId })
            .HasDatabaseName("UX_PrescriptionRefills_Sale_Item")
            .IsUnique()
            .HasFilter("\"SaleId\" IS NOT NULL");
        builder.HasOne<PrescriptionItem>().WithMany().HasForeignKey(x => x.PrescriptionItemId).OnDelete(DeleteBehavior.NoAction);
        builder.Ignore(x => x.DomainEvents);
    }
}
