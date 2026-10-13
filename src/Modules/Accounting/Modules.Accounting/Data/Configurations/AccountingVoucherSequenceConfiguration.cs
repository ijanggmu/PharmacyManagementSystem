using FSH.Modules.Accounting.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace FSH.Modules.Accounting.Data.Configurations;

public sealed class AccountingVoucherSequenceConfiguration : IEntityTypeConfiguration<AccountingVoucherSequence>
{
    public void Configure(EntityTypeBuilder<AccountingVoucherSequence> builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        builder.ToTable("VoucherSequences");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Series).IsRequired().HasMaxLength(8);
        // One counter row per tenant and series; also the ON CONFLICT target for the first-use insert.
        // TenantId is the multitenancy shadow property; declared here so the index can name it.
        builder.Property<string>("TenantId");
        builder.HasIndex("TenantId", nameof(AccountingVoucherSequence.Series)).IsUnique();
        builder.Ignore(x => x.DomainEvents);
    }
}
