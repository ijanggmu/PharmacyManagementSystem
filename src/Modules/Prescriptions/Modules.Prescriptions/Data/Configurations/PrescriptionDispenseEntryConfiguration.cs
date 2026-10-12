using FSH.Modules.Prescriptions.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace FSH.Modules.Prescriptions.Data.Configurations;

public sealed class PrescriptionDispenseEntryConfiguration : IEntityTypeConfiguration<PrescriptionDispenseEntry>
{
    public void Configure(EntityTypeBuilder<PrescriptionDispenseEntry> builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        builder.ToTable("PrescriptionDispenseEntries");
        builder.HasKey(x => x.Id);

        builder.Property(x => x.Quantity).HasPrecision(18, 3);
        builder.Property(x => x.ReferenceType).IsRequired().HasMaxLength(16);

        // One dispense per sale and item, one reversal per cancel/return and item: a redelivered event
        // is a no-op instead of a double count.
        builder.HasIndex(x => new { x.SaleId, x.PrescriptionItemId, x.ReferenceType, x.ReferenceId }).IsUnique();
        builder.HasIndex(x => x.PrescriptionId);
        builder.HasOne<PrescriptionItem>().WithMany().HasForeignKey(x => x.PrescriptionItemId).OnDelete(DeleteBehavior.Restrict);
        builder.Ignore(x => x.DomainEvents);
    }
}
