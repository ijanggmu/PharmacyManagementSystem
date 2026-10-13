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
        builder.Property(x => x.SupplierVatNumber).HasMaxLength(32);
        builder.Property(x => x.VendorName).HasMaxLength(256);

        builder.HasIndex(x => x.ExpenseDateUtc);
        builder.HasIndex(x => x.Category);
        builder.HasIndex(x => x.BranchId);
        builder.HasIndex(x => x.SupplierId);

        builder.Property(x => x.Amount).HasPrecision(18, 2);
        builder.Property(x => x.VatAmount).HasPrecision(18, 2);
        builder.Property(x => x.TdsCategoryCode).HasMaxLength(TdsCategory.CodeMaxLength);
        builder.Property(x => x.TdsCategoryName).HasMaxLength(TdsCategory.NameMaxLength);
        builder.Property(x => x.TdsRatePercent).HasPrecision(5, 2);
        builder.Property(x => x.TdsAmount).HasPrecision(18, 2);
        builder.Ignore(x => x.NetAmount);
        builder.Ignore(x => x.PayableAmount);
        builder.Ignore(x => x.Tds);
        builder.Ignore(x => x.IsOnCredit);
        builder.Ignore(x => x.DomainEvents);
    }
}
