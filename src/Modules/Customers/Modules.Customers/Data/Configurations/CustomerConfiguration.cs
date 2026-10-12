using FSH.Modules.Customers.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace FSH.Modules.Customers.Data.Configurations;

public sealed class CustomerConfiguration : IEntityTypeConfiguration<Customer>
{
    public void Configure(EntityTypeBuilder<Customer> builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        builder.ToTable("Customers");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Name).IsRequired().HasMaxLength(256);
        builder.Property(x => x.Phone).HasMaxLength(32);
        builder.Property(x => x.Email).HasMaxLength(256);
        builder.Property(x => x.Address).HasMaxLength(512);
        builder.Property(x => x.CurrentBalance).HasPrecision(18, 2);
        builder.Property(x => x.Code).IsRequired().HasMaxLength(32);
        builder.Property(x => x.CreditLimit).HasPrecision(18, 2);
        builder.Ignore(x => x.AvailableCredit);
        builder.Property(x => x.DeletedBy).HasMaxLength(64);
        builder.Property(x => x.Allergies)
            .HasColumnName("Allergies")
            .HasColumnType("text[]")
            .HasDefaultValueSql("'{}'")
            .IsRequired();
        builder.HasIndex(x => x.Name);
        // Unique per tenant (Finbuckle appends TenantId), across live and trashed customers alike.
        builder.HasIndex(x => x.Code).IsUnique();
        builder.HasIndex(x => x.IsDeleted);
        // Optimistic concurrency for the running balance: maps to Postgres xmin, so no column is added.
        builder.Property<uint>("Version").IsRowVersion();
        builder.Ignore(x => x.DomainEvents);
    }
}
