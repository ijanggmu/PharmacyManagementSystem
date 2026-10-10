using FSH.Modules.Prescriptions.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace FSH.Modules.Prescriptions.Data.Configurations;

public sealed class PrescriptionNumberSequenceConfiguration : IEntityTypeConfiguration<PrescriptionNumberSequence>
{
    public void Configure(EntityTypeBuilder<PrescriptionNumberSequence> builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        builder.ToTable("PrescriptionNumberSequences");
        builder.HasKey(x => x.Id);
        // One counter per tenant. TenantId is the Finbuckle shadow column; it is declared here so the
        // unique index exists before BaseDbContext applies tenant isolation, and it is the upsert conflict target.
        builder.Property<string>("TenantId").IsRequired();
        builder.HasIndex("TenantId").IsUnique();
        builder.Ignore(x => x.DomainEvents);
    }
}
