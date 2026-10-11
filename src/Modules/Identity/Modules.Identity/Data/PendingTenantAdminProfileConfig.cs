using FSH.Modules.Identity.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace FSH.Modules.Identity.Data;

public class PendingTenantAdminProfileConfig : IEntityTypeConfiguration<PendingTenantAdminProfile>
{
    public void Configure(EntityTypeBuilder<PendingTenantAdminProfile> builder)
    {
        ArgumentNullException.ThrowIfNull(builder);

        builder.ToTable("PendingTenantAdminProfiles", IdentityModuleConstants.SchemaName);
        builder.HasKey(p => p.Id);
        builder.Property(p => p.TenantId).HasMaxLength(64).IsRequired();
        builder.Property(p => p.Email).HasMaxLength(256).IsRequired();
        builder.Property(p => p.FirstName).HasMaxLength(100);
        builder.Property(p => p.LastName).HasMaxLength(100);
        builder.Property(p => p.PhoneNumber).HasMaxLength(32);
        builder.Property(p => p.ExternalLoginProvider).HasMaxLength(64);
        builder.Property(p => p.ExternalProviderKey).HasMaxLength(256);
        builder.Property(p => p.ExternalDisplayName).HasMaxLength(256);
        builder.HasIndex(p => p.TenantId);
    }
}
