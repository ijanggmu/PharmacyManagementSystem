using FSH.Modules.Reference.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace FSH.Modules.Reference.Data.Configurations;

public sealed class PharmacyLicenseConfiguration : IEntityTypeConfiguration<PharmacyLicense>
{
    public void Configure(EntityTypeBuilder<PharmacyLicense> builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        builder.ToTable("PharmacyLicenses");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.LicenseType).IsRequired().HasMaxLength(40);
        builder.Property(x => x.Title).HasMaxLength(120);
        builder.Property(x => x.Number).IsRequired().HasMaxLength(80);
        builder.Property(x => x.HolderName).HasMaxLength(160);
        builder.Property(x => x.Notes).HasMaxLength(1000);
        builder.HasIndex(x => x.ExpiresOn);
        builder.Ignore(x => x.DomainEvents);
    }
}
