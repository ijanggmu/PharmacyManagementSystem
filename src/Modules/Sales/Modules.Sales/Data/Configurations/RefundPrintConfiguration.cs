using FSH.Modules.Sales.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace FSH.Modules.Sales.Data.Configurations;

public sealed class RefundPrintConfiguration : IEntityTypeConfiguration<RefundPrint>
{
    public void Configure(EntityTypeBuilder<RefundPrint> builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        builder.ToTable("RefundPrints");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Format).HasMaxLength(32);
        builder.HasIndex(x => new { x.RefundId, x.PrintNumber }).IsUnique();
        builder.HasIndex(x => x.BranchId);
        builder.Ignore(x => x.DomainEvents);
    }
}
