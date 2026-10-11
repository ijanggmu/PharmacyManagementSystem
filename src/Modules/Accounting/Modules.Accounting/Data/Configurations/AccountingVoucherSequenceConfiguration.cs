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
        // One counter row per tenant; also the ON CONFLICT target for the first-use insert.
        // TenantId is the multitenancy shadow property; declared here so the index can name it.
        builder.Property<string>("TenantId");
        builder.HasIndex("TenantId").IsUnique();
        builder.Ignore(x => x.DomainEvents);
    }
}
