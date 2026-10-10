using FSH.Modules.Purchasing.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace FSH.Modules.Purchasing.Data.Configurations;

public sealed class PurchasingNumberSequenceConfiguration : IEntityTypeConfiguration<PurchasingNumberSequence>
{
    public void Configure(EntityTypeBuilder<PurchasingNumberSequence> builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        builder.ToTable("NumberSequences");
        builder.HasKey(x => x.Id);
        // TenantId is the Finbuckle shadow column, declared here so the unique index (the upsert
        // conflict target) exists before BaseDbContext applies tenant isolation.
        builder.Property<string>("TenantId").IsRequired();
        builder.Property(x => x.Series).HasMaxLength(8);
        builder.HasIndex(
            "TenantId", nameof(PurchasingNumberSequence.BranchId), nameof(PurchasingNumberSequence.Series), nameof(PurchasingNumberSequence.FiscalYear))
            .IsUnique();
        builder.Ignore(x => x.DomainEvents);
    }
}
