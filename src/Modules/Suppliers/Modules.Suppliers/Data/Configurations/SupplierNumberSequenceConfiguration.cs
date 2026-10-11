using FSH.Modules.Suppliers.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace FSH.Modules.Suppliers.Data.Configurations;

public sealed class SupplierNumberSequenceConfiguration : IEntityTypeConfiguration<SupplierNumberSequence>
{
    public void Configure(EntityTypeBuilder<SupplierNumberSequence> builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        builder.ToTable("NumberSequences");
        builder.HasKey(x => x.Id);
        // TenantId is the Finbuckle shadow column, declared so the unique index (the upsert conflict
        // target) exists before BaseDbContext applies tenant isolation.
        builder.Property<string>("TenantId").IsRequired();
        builder.Property(x => x.Series).HasMaxLength(8);
        builder.HasIndex(
            "TenantId", nameof(SupplierNumberSequence.BranchId), nameof(SupplierNumberSequence.Series), nameof(SupplierNumberSequence.FiscalYear))
            .IsUnique();
        builder.Ignore(x => x.DomainEvents);
    }
}
