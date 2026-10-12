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
        builder.HasOne<Customer>().WithMany().HasForeignKey(x => x.CustomerId).OnDelete(DeleteBehavior.Restrict);
        // At most one earn and one redeem entry per sale, so a redelivered SaleCompleted event can't double-post.
        // Named: the reversal index below is on the same columns, and unnamed they would collapse into one.
        builder.HasIndex(x => new { x.SaleId, x.EntryType }, "IX_CustomerLoyaltyEntries_SaleId_EntryType_Unique").IsUnique()
            .HasFilter("\"SaleId\" IS NOT NULL AND \"EntryType\" IN ('Earn', 'Redeem')");
        // A cancelled sale reverses its earn and returns its redeem once; a refund reverses earned points once.
        builder.HasIndex(x => new { x.SaleId, x.EntryType }, "IX_CustomerLoyaltyEntries_SaleId_Reversal_Unique").IsUnique()
            .HasFilter("\"SaleId\" IS NOT NULL AND \"RefundId\" IS NULL AND \"EntryType\" IN ('EarnReversed', 'RedeemReturned')");
        builder.HasIndex(x => x.RefundId).IsUnique().HasFilter("\"RefundId\" IS NOT NULL");
        builder.HasIndex(x => x.BranchId);
        builder.Ignore(x => x.DomainEvents);
    }
}
