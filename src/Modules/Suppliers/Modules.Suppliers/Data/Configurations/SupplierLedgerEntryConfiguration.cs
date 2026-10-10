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
        builder.Property(x => x.ReferenceType).HasMaxLength(64);
        builder.Property(x => x.DocumentNumber).HasMaxLength(64);
        builder.Property(x => x.SupplierBillNumber).HasMaxLength(128);
        builder.HasIndex(x => new { x.SupplierId, x.ReferenceType, x.ReferenceId });
        builder.HasIndex(x => new { x.SupplierId, x.EntryDateUtc });
        builder.HasIndex(x => x.BranchId);
        builder.Ignore(x => x.DomainEvents);
    }
}
