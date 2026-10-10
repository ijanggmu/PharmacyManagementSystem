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
        builder.Ignore(x => x.DomainEvents);
    }
}
