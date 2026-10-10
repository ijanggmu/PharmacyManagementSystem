using FSH.Modules.Accounting.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace FSH.Modules.Accounting.Data.Configurations;

public sealed class AccountingAccountConfiguration : IEntityTypeConfiguration<AccountingAccount>
{
    public void Configure(EntityTypeBuilder<AccountingAccount> builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        builder.ToTable("Accounts");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Code).IsRequired().HasMaxLength(32);
        builder.Property(x => x.Name).IsRequired().HasMaxLength(256);
        builder.Property(x => x.AccountType).HasConversion<string>().HasMaxLength(16);
        builder.HasIndex(x => x.Code).IsUnique();

        // Chart tree: a parent can't be removed while it has children (accounts are never deleted anyway).
        builder.HasOne<AccountingAccount>()
            .WithMany()
            .HasForeignKey(x => x.ParentId)
            .OnDelete(DeleteBehavior.Restrict);
        builder.HasIndex(x => x.ParentId);
        builder.Ignore(x => x.IsRootHead);
        builder.Ignore(x => x.DomainEvents);
    }
}
