using FSH.Modules.Accounting.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace FSH.Modules.Accounting.Data.Configurations;

public sealed class FixedAssetConfiguration : IEntityTypeConfiguration<FixedAsset>
{
    public void Configure(EntityTypeBuilder<FixedAsset> builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        builder.ToTable("FixedAssets");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Name).HasMaxLength(FixedAsset.NameMaxLength).IsRequired();
        builder.Property(x => x.Category).HasMaxLength(FixedAsset.CategoryMaxLength).IsRequired();
        builder.Property(x => x.AssetTag).HasMaxLength(FixedAsset.TagMaxLength);
        builder.Property(x => x.Location).HasMaxLength(FixedAsset.LocationMaxLength);
        builder.Property(x => x.Source).HasConversion<string>().HasMaxLength(32);
        builder.Property(x => x.PaymentMethod).HasMaxLength(32);
        builder.Property(x => x.VendorName).HasMaxLength(256);
        builder.Property(x => x.SupplierVatNumber).HasMaxLength(32);
        builder.Property(x => x.BillNumber).HasMaxLength(128);
        builder.Property(x => x.Cost).HasPrecision(18, 2);
        builder.Property(x => x.VatAmount).HasPrecision(18, 2);
        builder.Property(x => x.ResidualValue).HasPrecision(18, 2);
        builder.Property(x => x.Method).HasConversion<string>().HasMaxLength(32);
        builder.Property(x => x.RatePercent).HasPrecision(5, 2);
        builder.Property(x => x.TaxPool).HasMaxLength(4).IsRequired();
        builder.Property(x => x.OpeningAccumulatedDepreciation).HasPrecision(18, 2);
        builder.Property(x => x.OpeningTaxWrittenDownValue).HasPrecision(18, 2);
        builder.Property(x => x.DisposalKind).HasConversion<string>().HasMaxLength(32);
        builder.Property(x => x.DisposalProceeds).HasPrecision(18, 2);
        builder.Property(x => x.DisposalPaymentMethod).HasMaxLength(32);
        builder.Property(x => x.DisposalAccumulatedDepreciation).HasPrecision(18, 2);
        builder.Property(x => x.DisposalGainLoss).HasPrecision(18, 2);
        builder.Property(x => x.DisposalNotes).HasMaxLength(FixedAsset.NotesMaxLength);
        builder.Property(x => x.Notes).HasMaxLength(FixedAsset.NotesMaxLength);
        builder.Property(x => x.CreatedBy).HasMaxLength(256).IsRequired();

        builder.HasIndex(x => x.BranchId);
        builder.HasIndex(x => x.AcquisitionDateUtc);
        builder.HasIndex(x => x.SupplierId);

        builder.Ignore(x => x.IsOpening);
        builder.Ignore(x => x.DisposalPeriod);
        builder.Ignore(x => x.Terms);
        builder.Ignore(x => x.DomainEvents);
    }
}
