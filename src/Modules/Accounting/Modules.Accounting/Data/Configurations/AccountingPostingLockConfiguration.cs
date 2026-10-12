using FSH.Modules.Accounting.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace FSH.Modules.Accounting.Data.Configurations;

public sealed class AccountingPostingLockConfiguration : IEntityTypeConfiguration<AccountingPostingLock>
{
    public void Configure(EntityTypeBuilder<AccountingPostingLock> builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        builder.ToTable("PostingLocks");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.UpdatedBy).HasMaxLength(256);

        // One lock row per tenant — also what lets the first-use insert be an upsert. TenantId is the
        // multitenancy shadow property; declared here so the index can name it.
        builder.Property<string>("TenantId");
        builder.HasIndex("TenantId").IsUnique();
        builder.Ignore(x => x.DomainEvents);
    }
}
