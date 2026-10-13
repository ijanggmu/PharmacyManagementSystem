using FSH.Modules.Suppliers.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace FSH.Modules.Suppliers.Data.Configurations;

public sealed class ExpiryClaimConfiguration : IEntityTypeConfiguration<ExpiryClaim>
{
    public void Configure(EntityTypeBuilder<ExpiryClaim> builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        builder.ToTable("ExpiryClaims");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.ClaimNumber).IsRequired().HasMaxLength(32);
        builder.Property(x => x.Status).HasConversion<string>().HasMaxLength(16);
        builder.Property(x => x.Notes).HasMaxLength(1024);
        builder.Property(x => x.DebitNoteNumber).HasMaxLength(64);
        builder.Property(x => x.SupplierCreditNoteNumber).HasMaxLength(100);
        builder.Property(x => x.RejectionReason).HasMaxLength(512);
        builder.Ignore(x => x.ClaimedValue);
        builder.Ignore(x => x.AcceptedValue);

        builder.HasIndex(x => x.SupplierId);
        builder.HasIndex(x => new { x.BranchId, x.Status });
        builder.HasIndex(x => x.CreatedAtUtc);

        builder.HasMany(x => x.Lines)
            .WithOne()
            .HasForeignKey(l => l.ExpiryClaimId)
            .OnDelete(DeleteBehavior.Cascade);
        builder.Navigation(x => x.Lines).UsePropertyAccessMode(PropertyAccessMode.Field);

        builder.HasOne<Supplier>().WithMany().HasForeignKey(x => x.SupplierId).OnDelete(DeleteBehavior.Restrict);
        builder.Ignore(x => x.DomainEvents);
    }
}
