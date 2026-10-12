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
        builder.Property(x => x.ReversedShare).HasPrecision(7, 6);
        builder.HasIndex(x => new { x.CustomerId, x.CreatedAtUtc });
        builder.HasIndex(x => x.SaleId);

        // Points are earned / redeemed at most once per sale (redelivered SaleCompleted events).
        // Adjustments (staff corrections, reversals) may repeat a sale id and are not constrained.
        builder.HasIndex(x => new { x.SaleId, x.EntryType })
            .HasDatabaseName("UX_CustomerLoyaltyEntries_Sale_EntryType")
            .IsUnique()
            .HasFilter("\"SaleId\" IS NOT NULL AND \"EntryType\" IN ('Earn', 'Redeem')");
        builder.HasIndex(x => x.BranchId);
        builder.HasOne<Customer>().WithMany().HasForeignKey(x => x.CustomerId).OnDelete(DeleteBehavior.Restrict);
        builder.Ignore(x => x.DomainEvents);
    }
}
