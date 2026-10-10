using FSH.Modules.Onboarding.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace FSH.Modules.Onboarding.Data.Configurations;

public sealed class MigrationLineItemConfiguration : IEntityTypeConfiguration<MigrationLineItem>
{
    public void Configure(EntityTypeBuilder<MigrationLineItem> builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        builder.ToTable("MigrationLineItems");
        builder.HasKey(x => x.Id);

        // Reached only via SessionId, never a parent nav-collection — ValueGeneratedNever() is not
        // needed here (see database.md's nav-child footgun note).
        builder.Property(x => x.Category).HasConversion<string>().HasMaxLength(20);
        builder.Property(x => x.BatchNo).HasMaxLength(100);
        builder.Property(x => x.Description).HasMaxLength(1024);
        builder.HasIndex(x => new { x.SessionId, x.Category });

        builder.Ignore(x => x.DomainEvents);
    }
}
