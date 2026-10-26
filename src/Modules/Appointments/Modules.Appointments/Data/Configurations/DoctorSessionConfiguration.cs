using FSH.Modules.Appointments.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace FSH.Modules.Appointments.Data.Configurations;

public sealed class DoctorSessionConfiguration : IEntityTypeConfiguration<DoctorSession>
{
    public const string OneSessionPerSittingIndexName = "UX_DoctorSessions_Doctor_Date_Start";

    public void Configure(EntityTypeBuilder<DoctorSession> builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        builder.ToTable("DoctorSessions");
        builder.HasKey(x => x.Id);

        // Two counters booking the first token of a sitting at once both try to create it: the second insert loses
        // here and re-reads the winner's row (Finbuckle appends TenantId).
        builder.HasIndex(x => new { x.DoctorId, x.Date, x.StartTime })
            .HasDatabaseName(OneSessionPerSittingIndexName)
            .IsUnique();
        builder.HasIndex(x => new { x.BranchId, x.Date });

        // xmin: concurrent token issues on the same sitting collide instead of handing out one number twice.
        builder.Property(x => x.RowVersion).IsRowVersion();
        builder.Ignore(x => x.IsFull);
        builder.Ignore(x => x.DomainEvents);
    }
}
