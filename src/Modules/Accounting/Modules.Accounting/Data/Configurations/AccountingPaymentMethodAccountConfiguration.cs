using FSH.Modules.Accounting.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace FSH.Modules.Accounting.Data.Configurations;

public sealed class AccountingPaymentMethodAccountConfiguration : IEntityTypeConfiguration<AccountingPaymentMethodAccount>
{
    public void Configure(EntityTypeBuilder<AccountingPaymentMethodAccount> builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        builder.ToTable("PaymentMethodAccounts");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Method).HasMaxLength(AccountingPaymentMethodAccount.MethodMaxLength).IsRequired();
        builder.Property(x => x.UpdatedBy).HasMaxLength(256).IsRequired();

        // One mapping per method per tenant. TenantId is the multitenancy shadow property; declared here so
        // the index can name it.
        builder.Property<string>("TenantId");
        builder.HasIndex("TenantId", nameof(AccountingPaymentMethodAccount.Method)).IsUnique();

        builder.HasOne<AccountingAccount>()
            .WithMany()
            .HasForeignKey(x => x.AccountId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.Ignore(x => x.DomainEvents);
    }
}
