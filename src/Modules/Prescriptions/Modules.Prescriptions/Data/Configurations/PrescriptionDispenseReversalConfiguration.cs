using FSH.Modules.Prescriptions.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace FSH.Modules.Prescriptions.Data.Configurations;

public sealed class PrescriptionDispenseReversalConfiguration : IEntityTypeConfiguration<PrescriptionDispenseReversal>
{
    public void Configure(EntityTypeBuilder<PrescriptionDispenseReversal> builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        builder.ToTable("PrescriptionDispenseReversals");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Id).ValueGeneratedNever();
        builder.Property(x => x.Source).HasConversion<string>().HasMaxLength(32);
        builder.Property(x => x.Quantity).HasPrecision(18, 3);

        // One reversal per (cancellation/return document, item): a redelivered event is a no-op.
        builder.HasIndex(x => new { x.SourceId, x.PrescriptionItemId }).IsUnique();
        builder.HasIndex(x => new { x.SaleId, x.PrescriptionItemId });
        builder.HasIndex(x => x.PrescriptionId);
        builder.Ignore(x => x.DomainEvents);
    }
}
