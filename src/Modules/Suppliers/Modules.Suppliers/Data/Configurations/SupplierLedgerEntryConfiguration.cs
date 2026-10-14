using FSH.Modules.Suppliers.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace FSH.Modules.Suppliers.Data.Configurations;

public sealed class SupplierLedgerEntryConfiguration : IEntityTypeConfiguration<SupplierLedgerEntry>
{
    public void Configure(EntityTypeBuilder<SupplierLedgerEntry> builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        builder.ToTable("SupplierLedgerEntries");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.EntryType).HasConversion<string>().HasMaxLength(32);
        builder.Property(x => x.Description).HasMaxLength(512);
        builder.Property(x => x.DebitAmount).HasPrecision(18, 2);
        builder.Property(x => x.CreditAmount).HasPrecision(18, 2);
        builder.Property(x => x.RunningBalance).HasPrecision(18, 2);
        builder.Property(x => x.TdsAmount).HasPrecision(18, 2);
        builder.Property(x => x.ReferenceType).HasMaxLength(64);
        builder.Property(x => x.DocumentNumber).HasMaxLength(64);
        builder.Property(x => x.PaymentNumber).HasMaxLength(64);
        builder.Property(x => x.SupplierBillNumber).HasMaxLength(128);
        builder.HasIndex(x => new { x.SupplierId, x.ReferenceType, x.ReferenceId });
        builder.HasIndex(x => new { x.SupplierId, x.EntryDateUtc });
        builder.HasIndex(x => x.BranchId);
        builder.HasOne<Supplier>().WithMany().HasForeignKey(x => x.SupplierId).OnDelete(DeleteBehavior.Restrict);
        // One purchase or return posting per source document. Payments are left out (several payments can
        // settle the same bill and carry that bill's reference), and so are onboarding opening balances,
        // which share the migration session as their reference.
        builder.HasIndex(x => new { x.SupplierId, x.ReferenceType, x.ReferenceId, x.EntryType }).IsUnique()
            .HasFilter("\"ReferenceId\" IS NOT NULL AND \"EntryType\" IN ('Purchase', 'Return') AND \"ReferenceType\" <> 'MigrationOpeningSupplier'")
            .HasDatabaseName("IX_SupplierLedgerEntries_Document_Unique");
        builder.Ignore(x => x.DomainEvents);
    }
}
