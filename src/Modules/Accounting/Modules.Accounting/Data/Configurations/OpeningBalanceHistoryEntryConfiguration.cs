using FSH.Modules.Accounting.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace FSH.Modules.Accounting.Data.Configurations;

public sealed class OpeningBalanceHistoryEntryConfiguration : IEntityTypeConfiguration<OpeningBalanceHistoryEntry>
{
    public void Configure(EntityTypeBuilder<OpeningBalanceHistoryEntry> builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        builder.ToTable("OpeningBalanceHistory");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Id).ValueGeneratedNever();
        builder.Property(x => x.Action).HasConversion<string>().HasMaxLength(16);
        builder.Property(x => x.TotalDebit).HasPrecision(18, 2);
        builder.Property(x => x.TotalCredit).HasPrecision(18, 2);
        builder.Property(x => x.EquityAdjustmentDebit).HasPrecision(18, 2);
        builder.Property(x => x.EquityAdjustmentCredit).HasPrecision(18, 2);
        builder.Property(x => x.EntriesJson).IsRequired().HasColumnType("jsonb");
        builder.Property(x => x.ChangesJson).IsRequired().HasColumnType("jsonb");
        builder.Property(x => x.Reason).HasMaxLength(OpeningBalanceRules.MaxReasonLength);
        builder.Property(x => x.PerformedByName).IsRequired().HasMaxLength(256);

        // One entry per sequence number per branch (tenant is added by the multi-tenant index
        // adjustment): two concurrent Set/Edit/Reset calls that read the same latest entry both try
        // to write sequence N+1, and the second fails instead of double-posting.
        builder.HasIndex(x => new { x.BranchId, x.Sequence }).IsUnique();
        builder.HasIndex(x => x.PerformedAtUtc);

        builder.Ignore(x => x.LeavesActiveOpening);
        builder.HasOne<AccountingVoucher>().WithMany().HasForeignKey(x => x.PostedVoucherId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<AccountingVoucher>().WithMany().HasForeignKey(x => x.ReversalVoucherId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<AccountingVoucher>().WithMany().HasForeignKey(x => x.ReversedVoucherId).OnDelete(DeleteBehavior.Restrict);
        builder.Ignore(x => x.DomainEvents);
    }
}
