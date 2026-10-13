using FSH.Modules.Accounting.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace FSH.Modules.Accounting.Data.Configurations;

public sealed class AccountingPostingLockChangeConfiguration : IEntityTypeConfiguration<AccountingPostingLockChange>
{
    public void Configure(EntityTypeBuilder<AccountingPostingLockChange> builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        builder.ToTable("PostingLockChanges");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.ChangedBy).IsRequired().HasMaxLength(AccountingPostingLockChange.MaxChangedByLength);

        // Newest-first listing per tenant. TenantId is the multitenancy shadow property; declared here so
        // the index can name it.
        builder.Property<string>("TenantId");
        builder.HasIndex("TenantId", nameof(AccountingPostingLockChange.ChangedAtUtc));
        builder.Ignore(x => x.DomainEvents);
    }
}
