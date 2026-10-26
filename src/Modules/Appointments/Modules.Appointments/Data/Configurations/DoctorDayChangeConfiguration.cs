using FSH.Modules.Appointments.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace FSH.Modules.Appointments.Data.Configurations;

public sealed class DoctorDayChangeConfiguration : IEntityTypeConfiguration<DoctorDayChange>
{
    public void Configure(EntityTypeBuilder<DoctorDayChange> builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        builder.ToTable("DoctorDayChanges");
        builder.HasKey(x => x.Id);

        // Reached only through Doctor.DayChanges — nav-child footgun (database.md).
        builder.Property(x => x.Id).ValueGeneratedNever();
        builder.Property(x => x.Kind).HasConversion<string>().HasMaxLength(16);
        builder.Property(x => x.Note).HasMaxLength(256);

        builder.HasIndex(x => new { x.DoctorId, x.Date });
        builder.HasIndex(x => x.Date);
        builder.Ignore(x => x.DomainEvents);
    }
}
