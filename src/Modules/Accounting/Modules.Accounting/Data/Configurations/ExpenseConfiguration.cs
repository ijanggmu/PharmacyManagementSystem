using FSH.Modules.Accounting.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace FSH.Modules.Accounting.Data.Configurations;

public sealed class ExpenseConfiguration : IEntityTypeConfiguration<Expense>
{
    public void Configure(EntityTypeBuilder<Expense> builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        builder.ToTable("Expenses");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Category).HasMaxLength(128);
        builder.Property(x => x.PaymentMethod).HasMaxLength(32);
        builder.Property(x => x.Description).HasMaxLength(1024);
        builder.Property(x => x.ReceiptReference).HasMaxLength(128);
        builder.Property(x => x.RecordedBy).HasMaxLength(256);

        builder.HasIndex(x => x.ExpenseDateUtc);
        builder.HasIndex(x => x.Category);
        builder.HasIndex(x => x.BranchId);

        builder.Ignore(x => x.DomainEvents);
    }
}
