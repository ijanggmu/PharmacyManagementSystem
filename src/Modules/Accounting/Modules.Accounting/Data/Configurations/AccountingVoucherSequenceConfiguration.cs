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
        builder.Ignore(x => x.DomainEvents);
    }
}
