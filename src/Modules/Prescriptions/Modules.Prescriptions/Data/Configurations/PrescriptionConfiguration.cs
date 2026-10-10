using FSH.Modules.Prescriptions.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace FSH.Modules.Prescriptions.Data.Configurations;

public sealed class PrescriptionConfiguration : IEntityTypeConfiguration<Prescription>
{
    public void Configure(EntityTypeBuilder<Prescription> builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        builder.ToTable("Prescriptions");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.DoctorName).IsRequired().HasMaxLength(256);
        builder.Property(x => x.Status).HasConversion<string>().HasMaxLength(16);
        builder.Property(x => x.CancelReason).HasMaxLength(512);
        builder.Property(x => x.Notes).HasMaxLength(2000);

        builder.Property(x => x.PrescriptionNumber).IsRequired().HasMaxLength(32);
        builder.HasIndex(x => x.PrescriptionNumber).IsUnique();
        builder.HasIndex(x => x.CustomerId);
        builder.HasIndex(x => x.Status);
        builder.HasIndex(x => x.ExpiryDate);

        builder.HasMany(x => x.Items)
            .WithOne()
            .HasForeignKey(i => i.PrescriptionId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.Navigation(x => x.Items).UsePropertyAccessMode(PropertyAccessMode.Field);

        builder.HasMany(x => x.Refills)
            .WithOne()
            .HasForeignKey(r => r.PrescriptionId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.Navigation(x => x.Refills).UsePropertyAccessMode(PropertyAccessMode.Field);

        builder.Ignore(x => x.DomainEvents);
    }
}
