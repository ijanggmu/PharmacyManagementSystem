using FSH.Modules.Suppliers.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace FSH.Modules.Suppliers.Data.Configurations;

public sealed class SupplierConfiguration : IEntityTypeConfiguration<Supplier>
{
    public void Configure(EntityTypeBuilder<Supplier> builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        builder.ToTable("Suppliers");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Name).IsRequired().HasMaxLength(256);
        builder.Property(x => x.ContactPerson).HasMaxLength(128);
        builder.Property(x => x.Phone).HasMaxLength(32);
        builder.Property(x => x.Email).HasMaxLength(256);
        builder.Property(x => x.Address).HasMaxLength(512);
        builder.Property(x => x.TaxId).HasMaxLength(64);
        builder.Property(x => x.CurrentBalance).HasPrecision(18, 2);
        builder.Property(x => x.DeletedBy).HasMaxLength(64);
        builder.HasIndex(x => x.Name);
        builder.HasIndex(x => x.IsDeleted);
        builder.Ignore(x => x.DomainEvents);
    }
}
