using FSH.Modules.Accounting.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace FSH.Modules.Accounting.Data.Configurations;

public sealed class BankStatementLineConfiguration : IEntityTypeConfiguration<BankStatementLine>
{
    public void Configure(EntityTypeBuilder<BankStatementLine> builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        builder.ToTable("BankStatementLines");
        builder.HasKey(x => x.Id);

        // Reached only through BankStatementImport.Lines nav collection — without this, EF treats
        // a freshly-created line as Modified instead of Added (database.md nav-child footgun).
        builder.Property(x => x.Id).ValueGeneratedNever();

        builder.Property(x => x.Description).HasMaxLength(1024);
        builder.Property(x => x.Reference).HasMaxLength(200);
        builder.Property(x => x.DebitAmount).HasPrecision(14, 2);
        builder.Property(x => x.CreditAmount).HasPrecision(14, 2);
        builder.Property(x => x.Status).HasConversion<string>().HasMaxLength(16);
        builder.Property(x => x.MatchedBy).HasMaxLength(256);
        builder.Property(x => x.Note).HasMaxLength(1024);

        builder.HasIndex(x => x.ImportId);
        builder.HasIndex(x => x.Status);

        // One GL line can back at most one statement line — without this, the same deposit could
        // "explain away" two different bank credits and the reconciliation would balance while
        // hiding a real discrepancy (mirrors scripts/100-bank-reconciliation.sql's
        // ux_bank_statement_lines_voucher_line partial unique index).
        builder.HasIndex(x => x.MatchedVoucherLineId)
            .IsUnique()
            .HasFilter("\"MatchedVoucherLineId\" IS NOT NULL");

        // SET NULL: deleting a draft voucher un-matches the statement line instead of blocking the delete.
        builder.HasOne<AccountingVoucherLine>().WithMany().HasForeignKey(x => x.MatchedVoucherLineId).OnDelete(DeleteBehavior.SetNull);
        builder.Ignore(x => x.DomainEvents);
    }
}
