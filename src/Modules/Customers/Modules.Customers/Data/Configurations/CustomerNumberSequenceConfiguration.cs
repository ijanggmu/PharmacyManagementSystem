using FSH.Modules.Customers.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace FSH.Modules.Customers.Data.Configurations;

public sealed class CustomerNumberSequenceConfiguration : IEntityTypeConfiguration<CustomerNumberSequence>
{
    public void Configure(EntityTypeBuilder<CustomerNumberSequence> builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        builder.ToTable("NumberSequences");
        builder.HasKey(x => x.Id);
        // TenantId is the Finbuckle shadow column, declared here so the unique index (the upsert
        // conflict target) exists before BaseDbContext applies tenant isolation.
        builder.Property<string>("TenantId").IsRequired();
        builder.Property(x => x.Series).HasMaxLength(8);
        builder.HasIndex(
            "TenantId", nameof(CustomerNumberSequence.BranchId), nameof(CustomerNumberSequence.Series), nameof(CustomerNumberSequence.FiscalYear))
            .IsUnique();
        builder.Ignore(x => x.DomainEvents);
    }
}
