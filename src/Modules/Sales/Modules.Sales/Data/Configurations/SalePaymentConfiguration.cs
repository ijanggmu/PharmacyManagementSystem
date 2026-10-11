using FSH.Modules.Sales.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace FSH.Modules.Sales.Data.Configurations;

public sealed class SalePaymentConfiguration : IEntityTypeConfiguration<SalePayment>
{
    public void Configure(EntityTypeBuilder<SalePayment> builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        builder.ToTable("SalePayments");
        builder.HasKey(x => x.Id);

        // Reached only through Sale.Payments nav collection (database.md nav-child footgun).
        builder.Property(x => x.Id).ValueGeneratedNever();

        builder.Property(x => x.BranchId).IsRequired();
        builder.Property(x => x.Method).HasMaxLength(32).IsRequired();
        builder.Property(x => x.Amount).HasPrecision(18, 2);
        builder.Property(x => x.Reference).HasMaxLength(100);
        builder.Ignore(x => x.DomainEvents);

        builder.HasIndex(x => x.SaleId);
        builder.HasIndex(x => x.BranchId);
    }
}
