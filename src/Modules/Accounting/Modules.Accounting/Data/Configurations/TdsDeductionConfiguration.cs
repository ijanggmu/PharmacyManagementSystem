using FSH.Modules.Accounting.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace FSH.Modules.Accounting.Data.Configurations;

public sealed class TdsDeductionConfiguration : IEntityTypeConfiguration<TdsDeduction>
{
    public void Configure(EntityTypeBuilder<TdsDeduction> builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        builder.ToTable("TdsDeductions");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.SourceType).HasMaxLength(64).IsRequired();
        builder.Property(x => x.VendorName).HasMaxLength(256).IsRequired();
        builder.Property(x => x.Pan).HasMaxLength(32);
        builder.Property(x => x.CategoryCode).HasMaxLength(TdsCategory.CodeMaxLength).IsRequired();
        builder.Property(x => x.CategoryName).HasMaxLength(TdsCategory.NameMaxLength).IsRequired();
        builder.Property(x => x.RatePercent).HasPrecision(5, 2);
        builder.Property(x => x.TaxableAmount).HasPrecision(18, 2);
        builder.Property(x => x.TdsAmount).HasPrecision(18, 2);
        builder.Property(x => x.DocumentReference).HasMaxLength(128);

        // One deduction per source document per tenant: a redelivered event can't record it twice.
        builder.Property<string>("TenantId");
        builder.HasIndex("TenantId", nameof(TdsDeduction.SourceType), nameof(TdsDeduction.SourceId)).IsUnique();
        builder.HasIndex(x => x.DeductionDateUtc);
        builder.HasIndex(x => x.BranchId);

        builder.Ignore(x => x.DomainEvents);
    }
}
