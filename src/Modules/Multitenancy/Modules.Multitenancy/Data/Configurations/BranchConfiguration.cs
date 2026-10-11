using FSH.Framework.Shared.Multitenancy;
using FSH.Modules.Multitenancy.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace FSH.Modules.Multitenancy.Data.Configurations;

public class BranchConfiguration : IEntityTypeConfiguration<Branch>
{
    public void Configure(EntityTypeBuilder<Branch> builder)
    {
        ArgumentNullException.ThrowIfNull(builder);

        builder.ToTable("Branches", MultitenancyConstants.Schema);

        builder.HasKey(b => b.Id);

        builder.Property(b => b.TenantId)
            .HasMaxLength(64)
            .IsRequired();

        builder.Property(b => b.Name)
            .HasMaxLength(200)
            .IsRequired();

        builder.Property(b => b.Code)
            .HasMaxLength(32)
            .IsRequired();

        builder.Property(b => b.IsActive)
            .IsRequired();

        builder.Property(b => b.IsDefault)
            .IsRequired()
            .HasDefaultValue(false);

        builder.Property(b => b.Address)
            .HasMaxLength(300);

        builder.Property(b => b.Phone)
            .HasMaxLength(32);

        builder.Property(b => b.Email)
            .HasMaxLength(256);

        // Multiple branches per tenant, but the (tenant, code) pair is unique — unlike TenantTheme,
        // which has exactly one row per tenant.
        builder.HasIndex(b => new { b.TenantId, b.Code })
            .IsUnique();

        builder.HasIndex(b => b.TenantId);

        // Audit
        builder.Property(b => b.CreatedOnUtc).IsRequired();
        builder.Property(b => b.CreatedBy).HasMaxLength(256);
        builder.Property(b => b.LastModifiedBy).HasMaxLength(256);
    }
}
