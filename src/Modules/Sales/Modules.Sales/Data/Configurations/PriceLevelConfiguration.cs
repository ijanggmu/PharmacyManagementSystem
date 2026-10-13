using FSH.Modules.Sales.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace FSH.Modules.Sales.Data.Configurations;

public sealed class PriceLevelConfiguration : IEntityTypeConfiguration<PriceLevel>
{
    public void Configure(EntityTypeBuilder<PriceLevel> builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        builder.ToTable("PriceLevels");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Name).HasMaxLength(PriceLevel.MaxNameLength).IsRequired();
        builder.Property(x => x.DiscountPercent).HasPrecision(5, 2);
        builder.Property(x => x.Description).HasMaxLength(PriceLevel.MaxDescriptionLength);

        // TenantId is Finbuckle's shadow column — declared so the name can be unique per tenant.
        builder.Property<string>("TenantId").IsRequired();
        builder.HasIndex("TenantId", nameof(PriceLevel.Name)).IsUnique();
        builder.Ignore(x => x.DomainEvents);
    }
}

public sealed class PriceLevelItemConfiguration : IEntityTypeConfiguration<PriceLevelItem>
{
    public void Configure(EntityTypeBuilder<PriceLevelItem> builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        builder.ToTable("PriceLevelItems");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.UnitPrice).HasPrecision(18, 2);
        builder.HasIndex(x => new { x.PriceLevelId, x.MedicineId }).IsUnique();
        builder.HasOne<PriceLevel>().WithMany().HasForeignKey(x => x.PriceLevelId).OnDelete(DeleteBehavior.Cascade);
        builder.Ignore(x => x.DomainEvents);
    }
}

public sealed class CustomerPriceLevelConfiguration : IEntityTypeConfiguration<CustomerPriceLevel>
{
    public void Configure(EntityTypeBuilder<CustomerPriceLevel> builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        builder.ToTable("CustomerPriceLevels");
        builder.HasKey(x => x.Id);
        builder.Property<string>("TenantId").IsRequired();
        // One level per customer.
        builder.HasIndex("TenantId", nameof(CustomerPriceLevel.CustomerId)).IsUnique();
        builder.HasIndex(x => x.PriceLevelId);
        builder.HasOne<PriceLevel>().WithMany().HasForeignKey(x => x.PriceLevelId).OnDelete(DeleteBehavior.Restrict);
        builder.Ignore(x => x.DomainEvents);
    }
}

public sealed class ParkedSaleConfiguration : IEntityTypeConfiguration<ParkedSale>
{
    public const string ClientParkIdIndexName = "UX_ParkedSales_TenantId_ClientParkId";

    public void Configure(EntityTypeBuilder<ParkedSale> builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        builder.ToTable("ParkedSales");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Label).HasMaxLength(ParkedSale.MaxLabelLength).IsRequired();
        builder.Property(x => x.CustomerName).HasMaxLength(ParkedSale.MaxNameLength);
        builder.Property(x => x.BuyerName).HasMaxLength(ParkedSale.MaxNameLength);
        builder.Property(x => x.BuyerPan).HasMaxLength(20);
        builder.Property(x => x.Notes).HasMaxLength(ParkedSale.MaxNotesLength);
        builder.Property(x => x.ParkedByName).HasMaxLength(ParkedSale.MaxNameLength);
        builder.Property(x => x.ClientParkId).HasMaxLength(ParkedSale.MaxClientParkIdLength);
        builder.Property(x => x.BillDiscountAmount).HasPrecision(18, 2);
        builder.Property(x => x.TotalAmount).HasPrecision(18, 2);
        builder.Property(x => x.LinesJson).HasColumnType("jsonb").IsRequired();
        builder.Ignore(x => x.Lines);

        builder.Property<string>("TenantId").IsRequired();
        builder.HasIndex("TenantId", nameof(ParkedSale.ClientParkId))
            .IsUnique()
            .HasFilter("\"ClientParkId\" IS NOT NULL")
            .HasDatabaseName(ClientParkIdIndexName);
        builder.HasIndex(x => new { x.BranchId, x.ExpiresAtUtc });
        builder.Ignore(x => x.DomainEvents);
    }
}
