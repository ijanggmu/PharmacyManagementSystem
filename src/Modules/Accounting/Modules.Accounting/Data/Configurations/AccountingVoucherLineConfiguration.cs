using FSH.Modules.Accounting.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace FSH.Modules.Accounting.Data.Configurations;

public sealed class AccountingVoucherLineConfiguration : IEntityTypeConfiguration<AccountingVoucherLine>
{
    public void Configure(EntityTypeBuilder<AccountingVoucherLine> builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        builder.ToTable("VoucherLines");
        builder.HasKey(x => x.Id);

        // Reached only through AccountingVoucher.Lines nav collection — without this, EF treats
        // a freshly-created line as Modified instead of Added (database.md nav-child footgun).
        builder.Property(x => x.Id).ValueGeneratedNever();

        builder.Property(x => x.Description).HasMaxLength(512);
        builder.Property(x => x.DebitAmount).HasPrecision(18, 2);
        builder.Property(x => x.CreditAmount).HasPrecision(18, 2);
        builder.HasIndex(x => x.AccountId);
        builder.HasIndex(x => x.VoucherId);
        builder.HasIndex(x => x.BranchId);
        builder.Ignore(x => x.DomainEvents);
    }
}
