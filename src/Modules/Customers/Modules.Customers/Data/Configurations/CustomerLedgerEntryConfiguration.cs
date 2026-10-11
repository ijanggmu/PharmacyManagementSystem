using FSH.Modules.Customers.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace FSH.Modules.Customers.Data.Configurations;

public sealed class CustomerLedgerEntryConfiguration : IEntityTypeConfiguration<CustomerLedgerEntry>
{
    public void Configure(EntityTypeBuilder<CustomerLedgerEntry> builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        builder.ToTable("CustomerLedgerEntries");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.EntryType).HasConversion<string>().HasMaxLength(32);
        builder.Property(x => x.Description).HasMaxLength(512);
        builder.Property(x => x.DebitAmount).HasPrecision(18, 2);
        builder.Property(x => x.CreditAmount).HasPrecision(18, 2);
        builder.Property(x => x.RunningBalance).HasPrecision(18, 2);
        builder.Property(x => x.ReferenceType).HasMaxLength(64);
        builder.Property(x => x.DocumentNumber).HasMaxLength(64);
        builder.HasIndex(x => new { x.CustomerId, x.EntryDateUtc });
        builder.HasIndex(x => x.BranchId);

        // A sale is put on account at most once: the SaleCompleted handler can be redelivered (the inbox
        // is marked after its commit), and this is the database-level guard behind its pre-check.
        // Only Sale entries are constrained — payments carry no reference, and reversals (returns,
        // refunds, cancellations) may legitimately reference the same sale several times.
        builder.HasIndex(x => new { x.ReferenceType, x.ReferenceId })
            .HasDatabaseName("UX_CustomerLedgerEntries_SaleReference")
            .IsUnique()
            .HasFilter("\"EntryType\" = 'Sale' AND \"ReferenceId\" IS NOT NULL");
        builder.Ignore(x => x.DomainEvents);
    }
}
