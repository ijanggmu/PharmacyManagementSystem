using FSH.Modules.Accounting.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace FSH.Modules.Accounting.Data.Configurations;

public sealed class TdsCategoryConfiguration : IEntityTypeConfiguration<TdsCategory>
{
    public void Configure(EntityTypeBuilder<TdsCategory> builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        builder.ToTable("TdsCategories");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Code).HasMaxLength(TdsCategory.CodeMaxLength).IsRequired();
        builder.Property(x => x.Name).HasMaxLength(TdsCategory.NameMaxLength).IsRequired();
        builder.Property(x => x.RatePercent).HasPrecision(5, 2);
        builder.Property(x => x.UpdatedBy).HasMaxLength(256).IsRequired();

        // One row per category code per tenant. TenantId is the multitenancy shadow property.
        builder.Property<string>("TenantId");
        builder.HasIndex("TenantId", nameof(TdsCategory.Code)).IsUnique();

        builder.Ignore(x => x.DomainEvents);
    }
}
