using FSH.Modules.Onboarding.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace FSH.Modules.Onboarding.Data.Configurations;

public sealed class MigrationSessionConfiguration : IEntityTypeConfiguration<MigrationSession>
{
    public void Configure(EntityTypeBuilder<MigrationSession> builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        builder.ToTable("MigrationSessions");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Status).HasConversion<string>().HasMaxLength(20);
        builder.Property(x => x.Notes).HasMaxLength(1024);
        builder.Property(x => x.CreatedBy).HasMaxLength(256);
        builder.Property(x => x.CommittedBy).HasMaxLength(256);

        builder.Ignore(x => x.DomainEvents);
    }
}
