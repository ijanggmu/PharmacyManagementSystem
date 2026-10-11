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
        builder.Property(x => x.ChronicConditions)
            .HasColumnType("text[]")
            .HasDefaultValueSql("'{}'")
            .IsRequired();
        builder.Property(x => x.CurrentMedications)
            .HasColumnType("text[]")
            .HasDefaultValueSql("'{}'")
            .IsRequired();

        // Npgsql maps a uint row version onto the xmin system column (no real column is added), so
        // balance/points read-modify-writes that race fail with DbUpdateConcurrencyException instead
        // of losing an update. The writers also lock the row first (CustomerRowLock).
        builder.Property(x => x.RowVersion).IsRowVersion();
        builder.HasIndex(x => x.Name);
        // Unique per tenant (Finbuckle appends TenantId), across live and trashed customers alike.
        builder.HasIndex(x => x.Code).IsUnique();
        builder.HasIndex(x => x.IsDeleted);
        builder.Ignore(x => x.DomainEvents);
    }
}
