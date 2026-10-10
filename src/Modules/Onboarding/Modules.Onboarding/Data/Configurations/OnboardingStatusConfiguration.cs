using FSH.Modules.Onboarding.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace FSH.Modules.Onboarding.Data.Configurations;

public sealed class OnboardingStatusConfiguration : IEntityTypeConfiguration<OnboardingStatus>
{
    public void Configure(EntityTypeBuilder<OnboardingStatus> builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        builder.ToTable("OnboardingStatuses");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.CompletedBy).HasMaxLength(256);

        builder.Ignore(x => x.DomainEvents);
    }
}
