using FSH.Modules.Reference.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace FSH.Modules.Reference.Data.Configurations;

public sealed class TenantSettingConfiguration : IEntityTypeConfiguration<TenantSetting>
{
    public void Configure(EntityTypeBuilder<TenantSetting> builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        builder.ToTable("TenantSettings");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Key).IsRequired().HasMaxLength(100);
        builder.Property(x => x.Value).IsRequired().HasMaxLength(2000);
        // Unique per tenant: BaseDbContext's AdjustUniqueIndexes widens this to (TenantId, Key).
        builder.HasIndex(x => x.Key).IsUnique();
        builder.Ignore(x => x.DomainEvents);
    }
}
