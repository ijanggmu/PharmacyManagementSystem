using FSH.Modules.Customers.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace FSH.Modules.Customers.Data.Configurations;

public sealed class CustomerLoyaltyEntryConfiguration : IEntityTypeConfiguration<CustomerLoyaltyEntry>
{
    public void Configure(EntityTypeBuilder<CustomerLoyaltyEntry> builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        builder.ToTable("CustomerLoyaltyEntries");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.EntryType).HasConversion<string>().HasMaxLength(16);
        builder.Property(x => x.Description).HasMaxLength(256);
        builder.HasIndex(x => new { x.CustomerId, x.CreatedAtUtc });
        builder.HasIndex(x => x.SaleId);
        builder.Ignore(x => x.DomainEvents);
    }
}
