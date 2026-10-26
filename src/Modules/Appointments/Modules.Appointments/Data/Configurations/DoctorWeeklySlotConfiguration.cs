using FSH.Modules.Appointments.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace FSH.Modules.Appointments.Data.Configurations;

public sealed class DoctorWeeklySlotConfiguration : IEntityTypeConfiguration<DoctorWeeklySlot>
{
    public void Configure(EntityTypeBuilder<DoctorWeeklySlot> builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        builder.ToTable("DoctorWeeklySlots");
        builder.HasKey(x => x.Id);

        // Reached only through Doctor.WeeklySlots — nav-child footgun (database.md).
        builder.Property(x => x.Id).ValueGeneratedNever();
        builder.Property(x => x.DayOfWeek).HasConversion<int>();

        builder.HasIndex(x => x.DoctorId);
        builder.HasIndex(x => new { x.BranchId, x.DayOfWeek });
        builder.Ignore(x => x.DomainEvents);
    }
}
