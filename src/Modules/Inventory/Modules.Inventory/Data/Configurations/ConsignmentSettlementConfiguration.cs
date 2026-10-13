using FSH.Modules.Inventory.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace FSH.Modules.Inventory.Data.Configurations;

public sealed class ConsignmentSettlementConfiguration : IEntityTypeConfiguration<ConsignmentSettlement>
{
    public void Configure(EntityTypeBuilder<ConsignmentSettlement> builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        builder.ToTable("ConsignmentSettlements");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.SettledBy).HasMaxLength(256);

        builder.HasIndex(x => x.SupplierId);
        builder.HasIndex(x => x.SettlementDateUtc);
        builder.HasIndex(x => x.BranchId);

        builder.Property(x => x.TotalAmount).HasPrecision(18, 2);
        builder.Property(x => x.VatAmount).HasPrecision(18, 2).HasDefaultValue(0m);
        builder.Ignore(x => x.DomainEvents);
    }
}
