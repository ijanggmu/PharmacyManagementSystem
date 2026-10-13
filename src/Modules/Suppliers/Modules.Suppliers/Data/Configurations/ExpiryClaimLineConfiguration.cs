using FSH.Modules.Suppliers.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace FSH.Modules.Suppliers.Data.Configurations;

public sealed class ExpiryClaimLineConfiguration : IEntityTypeConfiguration<ExpiryClaimLine>
{
    public void Configure(EntityTypeBuilder<ExpiryClaimLine> builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        builder.ToTable("ExpiryClaimLines");
        builder.HasKey(x => x.Id);

        // Reached only through ExpiryClaim.Lines (database.md nav-child footgun).
        builder.Property(x => x.Id).ValueGeneratedNever();

        builder.Property(x => x.MedicineName).IsRequired().HasMaxLength(256);
        builder.Property(x => x.BatchNo).IsRequired().HasMaxLength(64);
        builder.Property(x => x.Quantity).HasPrecision(18, 3);
        builder.Property(x => x.AcceptedQuantity).HasPrecision(18, 3);
        builder.Property(x => x.UnitCost).HasPrecision(18, 2);

        builder.HasIndex(x => x.ExpiryClaimId);
        builder.HasIndex(x => x.BatchId);
        builder.Ignore(x => x.DomainEvents);
    }
}
