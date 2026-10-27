using FSH.Modules.Appointments.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace FSH.Modules.Appointments.Data.Configurations;

public sealed class AppointmentSettingsConfiguration : IEntityTypeConfiguration<AppointmentSettings>
{
    public void Configure(EntityTypeBuilder<AppointmentSettings> builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        builder.ToTable("AppointmentSettings");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Key).IsRequired().HasMaxLength(32);
        // Unique per tenant (the tenant id is added to unique indexes): one settings row per pharmacy.
        builder.HasIndex(x => x.Key).IsUnique();
        builder.Ignore(x => x.DomainEvents);
    }
}
