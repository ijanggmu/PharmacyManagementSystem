using FSH.Modules.Sales.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace FSH.Modules.Sales.Data.Configurations;

public sealed class SaleRefundConfiguration : IEntityTypeConfiguration<SaleRefund>
{
    public void Configure(EntityTypeBuilder<SaleRefund> builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        builder.ToTable("SaleRefunds");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.BranchId).IsRequired();
        builder.Property(x => x.Status).HasConversion<string>().HasMaxLength(16);
        builder.Property(x => x.RefundReason).HasMaxLength(512);
        builder.Property(x => x.RefundType).HasMaxLength(32);
        builder.Property(x => x.RefundMethod).HasMaxLength(32);
        builder.Property(x => x.TaxRefundAmount).HasPrecision(18, 2);
        builder.Property(x => x.ProcessingFee).HasPrecision(18, 2);
        builder.Property(x => x.Notes).HasMaxLength(1024);
        builder.Property(x => x.RefundNumber).HasMaxLength(32);
        builder.Property(x => x.CreditNoteNumber).HasMaxLength(32);
        builder.Property(x => x.VatRatePercent).HasPrecision(5, 2);
        builder.Property(x => x.TaxableAmount).HasPrecision(18, 2);
        builder.Property(x => x.VatAmount).HasPrecision(18, 2);
        builder.Property(x => x.ExemptAmount).HasPrecision(18, 2);
        builder.Ignore(x => x.RefundAmount);
        builder.Ignore(x => x.NetRefundAmount);
        builder.Property(x => x.AccountCreditAmount).HasPrecision(18, 2).HasDefaultValue(0m);

        // A return pays out through exactly one refund.
        builder.HasIndex(x => x.ReturnId).IsUnique().HasFilter("\"ReturnId\" IS NOT NULL");
        builder.HasOne<SaleReturn>().WithMany().HasForeignKey(x => x.ReturnId).OnDelete(DeleteBehavior.Restrict);

        builder.HasIndex(x => x.OriginalSaleId);
        builder.HasIndex(x => x.BranchId);
        builder.HasIndex(x => x.CustomerId);
        builder.HasIndex(x => x.Status);
        builder.HasIndex(x => x.RefundDateUtc);
        builder.HasIndex(x => x.RefundNumber).IsUnique();

        builder.HasMany(x => x.Items)
            .WithOne()
            .HasForeignKey(i => i.SaleRefundId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.Navigation(x => x.Items).UsePropertyAccessMode(PropertyAccessMode.Field);

        builder.HasOne<Sale>().WithMany().HasForeignKey(x => x.OriginalSaleId).OnDelete(DeleteBehavior.Restrict);
        builder.Ignore(x => x.DomainEvents);
    }
}
