using FSH.Modules.Accounting.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace FSH.Modules.Accounting.Data.Configurations;

public sealed class AccountingVoucherConfiguration : IEntityTypeConfiguration<AccountingVoucher>
{
    public void Configure(EntityTypeBuilder<AccountingVoucher> builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        builder.ToTable("Vouchers");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.VoucherNo).IsRequired().HasMaxLength(32);
        builder.Property(x => x.VoucherType).IsRequired().HasMaxLength(64);
        builder.Property(x => x.Source).HasConversion<string>().HasMaxLength(16);
        builder.Property(x => x.Status).HasConversion<string>().HasMaxLength(16);
        builder.Property(x => x.ReferenceType).HasMaxLength(64);
        builder.Property(x => x.Narration).HasMaxLength(1024);
        builder.Property(x => x.PostedBy).HasMaxLength(128);
        builder.Property(x => x.VoidReason).HasMaxLength(512);

        // One POSTED voucher per (ReferenceType, ReferenceId) — the idempotency guarantee
        // IVoucherPostingService callers rely on. Data integrity, kept as a DB constraint
        // regardless of the app-level check (root plan §5).
        builder.HasIndex(x => new { x.ReferenceType, x.ReferenceId })
            .IsUnique()
            .HasFilter("\"Status\" = 'Posted' AND \"ReferenceType\" IS NOT NULL");

        builder.HasIndex(x => x.VoucherDateUtc);
        builder.HasIndex(x => x.Status);
        builder.HasIndex(x => x.ReversesVoucherId);
        builder.HasIndex(x => x.BranchId);

        builder.HasMany(x => x.Lines)
            .WithOne()
            .HasForeignKey(l => l.VoucherId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.Navigation(x => x.Lines).UsePropertyAccessMode(PropertyAccessMode.Field);

        builder.Ignore(x => x.DomainEvents);
    }
}
