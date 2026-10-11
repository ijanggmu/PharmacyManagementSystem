using FSH.Modules.Accounting.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace FSH.Modules.Accounting.Data.Configurations;

public sealed class BankReconciliationConfiguration : IEntityTypeConfiguration<BankReconciliation>
{
    public void Configure(EntityTypeBuilder<BankReconciliation> builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        builder.ToTable("BankReconciliations");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Notes).HasMaxLength(1024);
        builder.Property(x => x.ReconciledBy).HasMaxLength(256);

        builder.HasIndex(x => x.AsOfUtc);
        builder.HasIndex(x => x.BranchId);

        builder.Ignore(x => x.DomainEvents);
    }
}
