using FSH.Modules.Suppliers.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace FSH.Modules.Suppliers.Data.Configurations;

public sealed class SupplierPriceListItemConfiguration : IEntityTypeConfiguration<SupplierPriceListItem>
{
    /// <summary>One active price per supplier, medicine and start date (Finbuckle appends TenantId).</summary>
    public const string ActiveStartIndex = "IX_SupplierPriceListItems_Active_Unique";

    public void Configure(EntityTypeBuilder<SupplierPriceListItem> builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        builder.ToTable("SupplierPriceListItems");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.UnitCost).HasPrecision(18, 4);
        builder.Property(x => x.MinOrderQuantity).HasPrecision(18, 3);
        builder.Property(x => x.Notes).HasMaxLength(SupplierPriceListItem.NotesMaxLength);

        builder.HasIndex(x => new { x.SupplierId, x.MedicineId });
        builder.HasIndex(x => new { x.SupplierId, x.MedicineId, x.ValidFrom })
            .IsUnique()
            .HasDatabaseName(ActiveStartIndex)
            .HasFilter("\"IsActive\"");

        builder.HasOne<Supplier>().WithMany().HasForeignKey(x => x.SupplierId).OnDelete(DeleteBehavior.Restrict);
        builder.Ignore(x => x.DomainEvents);
    }
}
