using FSH.Modules.Inventory.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace FSH.Modules.Inventory.Data.Configurations;

public sealed class StockTransferConfiguration : IEntityTypeConfiguration<StockTransfer>
{
    public void Configure(EntityTypeBuilder<StockTransfer> builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        builder.ToTable("StockTransfers");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.TransferNumber).IsRequired().HasMaxLength(64);
        builder.Property(x => x.Status).HasConversion<string>().HasMaxLength(16);
        builder.Property(x => x.Notes).HasMaxLength(500);
        builder.Property(x => x.CancellationReason).HasMaxLength(500);

        builder.HasIndex(x => x.TransferNumber).IsUnique();
        builder.HasIndex(x => x.Status);
        builder.HasIndex(x => new { x.FromLocationId, x.ToLocationId });
        builder.HasIndex(x => new { x.FromBranchId, x.ToBranchId });

        builder.HasMany(x => x.Items)
            .WithOne()
            .HasForeignKey(i => i.StockTransferId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.Navigation(x => x.Items).UsePropertyAccessMode(PropertyAccessMode.Field);

        builder.Ignore(x => x.DomainEvents);
    }
}
