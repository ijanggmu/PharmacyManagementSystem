using FSH.Modules.Accounting.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace FSH.Modules.Accounting.Data.Configurations;

public sealed class AccountCashFlowTagConfiguration : IEntityTypeConfiguration<AccountCashFlowTag>
{
    public void Configure(EntityTypeBuilder<AccountCashFlowTag> builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        builder.ToTable("AccountCashFlowTags");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Activity).HasConversion<string>().HasMaxLength(16);
        builder.Property(x => x.UpdatedBy).HasMaxLength(256).IsRequired();

        // One tag per account per tenant. TenantId is the multitenancy shadow property; declared here so the
        // index can name it.
        builder.Property<string>("TenantId");
        builder.HasIndex("TenantId", nameof(AccountCashFlowTag.AccountId)).IsUnique();

        builder.HasOne<AccountingAccount>()
            .WithMany()
            .HasForeignKey(x => x.AccountId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.Ignore(x => x.DomainEvents);
    }
}
