using FSH.Modules.Suppliers.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace FSH.Modules.Suppliers.Data.Configurations;

public sealed class SupplierReturnConfiguration : IEntityTypeConfiguration<SupplierReturn>
{
    public void Configure(EntityTypeBuilder<SupplierReturn> builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        builder.ToTable("SupplierReturns");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Notes).HasMaxLength(1024);
        builder.Ignore(x => x.TotalCost);
        builder.Ignore(x => x.VatAmount);
        builder.Ignore(x => x.TotalAmount);
        builder.Property(x => x.DocumentNumber).HasMaxLength(64);
        builder.Property(x => x.SupplierInvoiceNumber).HasMaxLength(100);
        builder.HasIndex(x => x.DocumentNumber);

        builder.HasIndex(x => x.SupplierId);
        builder.HasIndex(x => x.ReturnDateUtc);
        builder.HasIndex(x => x.BranchId);

        builder.HasMany(x => x.Items)
            .WithOne()
            .HasForeignKey(i => i.SupplierReturnId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.Navigation(x => x.Items).UsePropertyAccessMode(PropertyAccessMode.Field);

        builder.Ignore(x => x.DomainEvents);
    }
}
