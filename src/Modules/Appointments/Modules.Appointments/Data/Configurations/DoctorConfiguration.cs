using FSH.Modules.Appointments.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace FSH.Modules.Appointments.Data.Configurations;

public sealed class DoctorConfiguration : IEntityTypeConfiguration<Doctor>
{
    public void Configure(EntityTypeBuilder<Doctor> builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        builder.ToTable("Doctors");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Name).IsRequired().HasMaxLength(200);
        builder.Property(x => x.NmcNumber).HasMaxLength(64);
        builder.Property(x => x.Speciality).HasMaxLength(128);
        builder.Property(x => x.Phone).HasMaxLength(32);
        builder.Property(x => x.Fee).HasPrecision(18, 2);
        builder.Property(x => x.ShareValue).HasPrecision(18, 2);
        builder.Property(x => x.ShareType).HasConversion<string>().HasMaxLength(16);

        // Maps onto Postgres' xmin system column (no real column): two people editing the same doctor's days
        // surface as a conflict instead of one silently overwriting the other.
        builder.Property(x => x.RowVersion).IsRowVersion();

        // One doctor per NMC number per pharmacy (Finbuckle appends TenantId).
        builder.HasIndex(x => x.NmcNumber).IsUnique().HasFilter("\"NmcNumber\" IS NOT NULL");
        builder.HasIndex(x => x.Name);

        builder.HasMany(x => x.WeeklySlots)
            .WithOne()
            .HasForeignKey(s => s.DoctorId)
            .OnDelete(DeleteBehavior.Cascade);
        builder.Navigation(x => x.WeeklySlots).UsePropertyAccessMode(PropertyAccessMode.Field);

        builder.HasMany(x => x.DayChanges)
            .WithOne()
            .HasForeignKey(c => c.DoctorId)
            .OnDelete(DeleteBehavior.Cascade);
        builder.Navigation(x => x.DayChanges).UsePropertyAccessMode(PropertyAccessMode.Field);

        builder.Ignore(x => x.DomainEvents);
    }
}
