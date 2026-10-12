using FSH.Modules.Accounting.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace FSH.Modules.Accounting.Data.Configurations;

public sealed class AccountingPendingReversalConfiguration : IEntityTypeConfiguration<AccountingPendingReversal>
{
    public void Configure(EntityTypeBuilder<AccountingPendingReversal> builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        builder.ToTable("PendingReversals");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.ReferenceType).IsRequired().HasMaxLength(64);
        builder.Property(x => x.Reason).IsRequired().HasMaxLength(512);

        // One tombstone per source document; a redelivered cancellation finds the existing row.
        // TenantId is the multitenancy shadow property; declared here so the index can name it.
        builder.Property<string>("TenantId");
        builder.HasIndex("TenantId", nameof(AccountingPendingReversal.ReferenceType), nameof(AccountingPendingReversal.ReferenceId)).IsUnique();

        builder.Ignore(x => x.DomainEvents);
    }
}
