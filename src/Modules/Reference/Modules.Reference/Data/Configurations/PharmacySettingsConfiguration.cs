using FSH.Modules.Reference.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace FSH.Modules.Reference.Data.Configurations;

public sealed class PharmacySettingsConfiguration : IEntityTypeConfiguration<PharmacySettings>
{
    public void Configure(EntityTypeBuilder<PharmacySettings> builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        builder.ToTable("PharmacySettings");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.BusinessName).IsRequired().HasMaxLength(256);
        builder.Property(x => x.BusinessAddress).HasMaxLength(512);
        builder.Property(x => x.BusinessPhone).HasMaxLength(32);
        builder.Property(x => x.BusinessEmail).HasMaxLength(256);
        builder.Property(x => x.CurrencyCode).IsRequired().HasMaxLength(3);
        builder.Property(x => x.VatRatePercent).HasPrecision(5, 2);
        builder.Property(x => x.InvoiceNumberPrefix).IsRequired().HasMaxLength(16);
        builder.Ignore(x => x.DomainEvents);
    }
}
