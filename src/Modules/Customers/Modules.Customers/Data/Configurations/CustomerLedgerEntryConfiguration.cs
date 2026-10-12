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
        builder.Property(x => x.PaymentMethod).HasMaxLength(32);
        builder.HasIndex(x => new { x.CustomerId, x.EntryDateUtc });
        builder.HasIndex(x => x.BranchId);
        builder.HasOne<Customer>().WithMany().HasForeignKey(x => x.CustomerId).OnDelete(DeleteBehavior.Restrict);
        // One AR posting per completed sale: backstops the SaleCompleted handler's idempotency check.
        builder.HasIndex(x => new { x.ReferenceType, x.ReferenceId }).IsUnique()
            .HasFilter("\"EntryType\" = 'Sale' AND \"ReferenceId\" IS NOT NULL")
            .HasDatabaseName("IX_CustomerLedgerEntries_SaleReference_Unique");
        builder.Ignore(x => x.DomainEvents);
    }
}
