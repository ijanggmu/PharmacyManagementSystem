using FSH.Modules.Appointments.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace FSH.Modules.Appointments.Data.Configurations;

public sealed class DoctorPayoutConfiguration : IEntityTypeConfiguration<DoctorPayout>
{
    public void Configure(EntityTypeBuilder<DoctorPayout> builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        builder.ToTable("DoctorPayouts");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Amount).HasPrecision(18, 2);
        builder.Property(x => x.PaymentMethod).IsRequired().HasMaxLength(32);
        builder.Property(x => x.Note).HasMaxLength(500);
        builder.Property(x => x.PaidBy).HasMaxLength(200);
        builder.HasIndex(x => new { x.DoctorId, x.PaidAtUtc });
        builder.HasIndex(x => new { x.BranchId, x.PaidAtUtc });
        builder.Ignore(x => x.DomainEvents);
    }
}
