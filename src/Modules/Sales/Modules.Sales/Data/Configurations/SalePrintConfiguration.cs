using FSH.Modules.Sales.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace FSH.Modules.Sales.Data.Configurations;

public sealed class SalePrintConfiguration : IEntityTypeConfiguration<SalePrint>
{
    public void Configure(EntityTypeBuilder<SalePrint> builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        builder.ToTable("SalePrints");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Format).HasMaxLength(32);
        builder.HasIndex(x => new { x.SaleId, x.PrintNumber }).IsUnique();
        builder.HasIndex(x => x.BranchId);
        builder.Ignore(x => x.DomainEvents);
    }
}
