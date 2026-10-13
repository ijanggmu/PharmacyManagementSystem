using FSH.Modules.Accounting.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace FSH.Modules.Accounting.Data.Configurations;

public sealed class FixedAssetDepreciationEntryConfiguration : IEntityTypeConfiguration<FixedAssetDepreciationEntry>
{
    public void Configure(EntityTypeBuilder<FixedAssetDepreciationEntry> builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        builder.ToTable("FixedAssetDepreciationEntries");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Amount).HasPrecision(18, 2);

        // One posted month per asset per tenant: the idempotency guarantee of depreciation runs (a concurrent second
        // run of the same period fails here instead of double-charging).
        builder.Property<string>("TenantId");
        builder.HasIndex("TenantId", nameof(FixedAssetDepreciationEntry.AssetId), nameof(FixedAssetDepreciationEntry.Period)).IsUnique();
        builder.HasIndex(x => x.RunId);
        builder.HasIndex(x => new { x.FiscalYear, x.FiscalMonth });

        builder.Ignore(x => x.DomainEvents);
    }
}
