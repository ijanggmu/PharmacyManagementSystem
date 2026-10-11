using FSH.Modules.Sales.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace FSH.Modules.Sales.Data.Configurations;

public sealed class CashShiftConfiguration : IEntityTypeConfiguration<CashShift>
{
    public void Configure(EntityTypeBuilder<CashShift> builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        builder.ToTable("CashShifts");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.BranchId).IsRequired();
        builder.Property(x => x.Status).HasConversion<string>().HasMaxLength(16);
        builder.Property(x => x.OpenedBy).HasMaxLength(256);
        builder.Property(x => x.ClosedBy).HasMaxLength(256);
        builder.Property(x => x.Notes).HasMaxLength(1024);
        builder.Property(x => x.ClosingNotes).HasMaxLength(1000);
        builder.Property(x => x.ClosingExpectedCash).HasPrecision(18, 2);
        builder.Property(x => x.ClosingCashSalesTotal).HasPrecision(18, 2);
        builder.Property(x => x.ClosingNonCashSalesTotal).HasPrecision(18, 2);
        builder.Property(x => x.ClosingCashRefundsTotal).HasPrecision(18, 2);

        builder.HasIndex(x => x.BranchId);
        builder.HasIndex(x => x.Status);
        builder.HasIndex(x => x.OpenedAtUtc);

        builder.Property(x => x.OpeningFloat).HasPrecision(18, 2);
        builder.Property(x => x.ClosingCashCounted).HasPrecision(18, 2);
        builder.Ignore(x => x.DomainEvents);
    }
}
