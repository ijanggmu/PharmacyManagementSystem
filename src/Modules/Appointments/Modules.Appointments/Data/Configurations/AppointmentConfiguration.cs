using FSH.Modules.Appointments.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace FSH.Modules.Appointments.Data.Configurations;

public sealed class AppointmentConfiguration : IEntityTypeConfiguration<Appointment>
{
    public void Configure(EntityTypeBuilder<Appointment> builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        builder.ToTable("Appointments");
        builder.HasKey(x => x.Id);

        builder.Property(x => x.PatientName).IsRequired().HasMaxLength(200);
        builder.Property(x => x.PatientPhone).HasMaxLength(32);
        builder.Property(x => x.Note).HasMaxLength(500);
        builder.Property(x => x.CancelReason).HasMaxLength(256);
        builder.Property(x => x.PaymentMethod).HasMaxLength(32);
        builder.Property(x => x.Status).HasConversion<string>().HasMaxLength(16);
        builder.Property(x => x.Source).HasConversion<string>().HasMaxLength(16);
        builder.Property(x => x.FeeAmount).HasPrecision(18, 2);
        builder.Property(x => x.DoctorShareAmount).HasPrecision(18, 2);
        builder.Property(x => x.RowVersion).IsRowVersion();

        // Backstop for the session's counter: a token number exists once per sitting.
        builder.HasIndex(x => new { x.SessionId, x.TokenNo }).IsUnique();
        builder.HasIndex(x => new { x.BranchId, x.Date });
        builder.HasIndex(x => new { x.DoctorId, x.PayoutId });
        builder.HasIndex(x => x.PatientPhone);
        builder.HasIndex(x => x.FeePaidAtUtc);

        builder.HasOne<DoctorSession>().WithMany().HasForeignKey(x => x.SessionId).OnDelete(DeleteBehavior.Restrict);
        builder.Ignore(x => x.HasPaidFee);
        builder.Ignore(x => x.DomainEvents);
    }
}
