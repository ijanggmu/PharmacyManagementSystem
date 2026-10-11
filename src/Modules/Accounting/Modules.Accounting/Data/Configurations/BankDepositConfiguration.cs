using FSH.Modules.Accounting.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace FSH.Modules.Accounting.Data.Configurations;

public sealed class BankDepositConfiguration : IEntityTypeConfiguration<BankDeposit>
{
    public void Configure(EntityTypeBuilder<BankDeposit> builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        builder.ToTable("BankDeposits");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Description).HasMaxLength(1024);
        builder.Property(x => x.RecordedBy).HasMaxLength(256);

        builder.HasIndex(x => x.DepositDateUtc);
        builder.HasIndex(x => x.BranchId);

        builder.Property(x => x.Amount).HasPrecision(18, 2);
        builder.Ignore(x => x.DomainEvents);
    }
}
