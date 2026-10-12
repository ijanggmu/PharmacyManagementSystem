using FSH.Modules.Sales.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace FSH.Modules.Sales.Data.Configurations;

public sealed class SaleReturnConfiguration : IEntityTypeConfiguration<SaleReturn>
{
    public void Configure(EntityTypeBuilder<SaleReturn> builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        builder.ToTable("SaleReturns");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.BranchId).IsRequired();
        builder.Property(x => x.Status).HasConversion<string>().HasMaxLength(16);
        builder.Property(x => x.ReturnReason).HasMaxLength(512);
        builder.Property(x => x.Notes).HasMaxLength(1024);
        builder.Ignore(x => x.TotalReturnAmount);

        builder.HasIndex(x => x.SaleId);
        builder.HasIndex(x => x.BranchId);
        builder.HasIndex(x => x.CustomerId);
        builder.HasIndex(x => x.Status);
        builder.HasIndex(x => x.ReturnDateUtc);

        builder.HasMany(x => x.Items)
            .WithOne()
            .HasForeignKey(i => i.SaleReturnId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.Navigation(x => x.Items).UsePropertyAccessMode(PropertyAccessMode.Field);

        builder.HasOne<Sale>().WithMany().HasForeignKey(x => x.SaleId).OnDelete(DeleteBehavior.Restrict);
        builder.Ignore(x => x.DomainEvents);
    }
}
