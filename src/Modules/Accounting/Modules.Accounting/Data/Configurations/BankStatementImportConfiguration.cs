using FSH.Modules.Accounting.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace FSH.Modules.Accounting.Data.Configurations;

public sealed class BankStatementImportConfiguration : IEntityTypeConfiguration<BankStatementImport>
{
    public void Configure(EntityTypeBuilder<BankStatementImport> builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        builder.ToTable("BankStatementImports");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.StatementLabel).HasMaxLength(200);
        builder.Property(x => x.OpeningBalance).HasPrecision(14, 2);
        builder.Property(x => x.ClosingBalance).HasPrecision(14, 2);
        builder.Property(x => x.Status).HasConversion<string>().HasMaxLength(16);
        builder.Property(x => x.CreatedBy).IsRequired().HasMaxLength(256);
        builder.Property(x => x.ReconciledBy).HasMaxLength(256);

        builder.HasIndex(x => new { x.AccountId, x.PeriodEndUtc });
        builder.HasIndex(x => x.Status);
        builder.HasIndex(x => x.BranchId);

        builder.HasMany(x => x.Lines)
            .WithOne()
            .HasForeignKey(l => l.ImportId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.Navigation(x => x.Lines).UsePropertyAccessMode(PropertyAccessMode.Field);

        builder.HasOne<AccountingAccount>().WithMany().HasForeignKey(x => x.AccountId).OnDelete(DeleteBehavior.Restrict);
        builder.Ignore(x => x.DomainEvents);
    }
}
