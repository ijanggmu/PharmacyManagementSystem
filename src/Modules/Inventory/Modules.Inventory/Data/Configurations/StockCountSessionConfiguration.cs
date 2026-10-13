using FSH.Modules.Inventory.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace FSH.Modules.Inventory.Data.Configurations;

public sealed class StockCountSessionConfiguration : IEntityTypeConfiguration<StockCountSession>
{
    public void Configure(EntityTypeBuilder<StockCountSession> builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        builder.ToTable("StockCountSessions");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.SessionNumber).IsRequired().HasMaxLength(32);
        builder.Property(x => x.Title).IsRequired().HasMaxLength(128);
        builder.Property(x => x.Status).HasConversion<string>().HasMaxLength(16);
        builder.Property(x => x.RackLocation).HasMaxLength(64);
        builder.Property(x => x.Notes).HasMaxLength(1024);
        builder.Property(x => x.PostedGainValue).HasPrecision(18, 2);
        builder.Property(x => x.PostedLossValue).HasPrecision(18, 2);

        builder.HasIndex(x => new { x.BranchId, x.Status });
        builder.HasIndex(x => x.CreatedAtUtc);
        builder.Ignore(x => x.DomainEvents);
    }
}
