using FSH.Modules.Accounting.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace FSH.Modules.Accounting.Data.Configurations;

public sealed class DepreciationRunConfiguration : IEntityTypeConfiguration<DepreciationRun>
{
    public void Configure(EntityTypeBuilder<DepreciationRun> builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        builder.ToTable("DepreciationRuns");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.TotalAmount).HasPrecision(18, 2);
        builder.Property(x => x.PostedBy).HasMaxLength(256).IsRequired();
        builder.Property(x => x.ReversedBy).HasMaxLength(256);

        builder.HasIndex(x => x.FiscalYear);
        builder.HasIndex(x => x.BranchId);

        builder.Ignore(x => x.IsReversed);
        builder.Ignore(x => x.DomainEvents);
    }
}
