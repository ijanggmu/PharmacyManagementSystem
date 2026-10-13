using FSH.Modules.Identity.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace FSH.Modules.Identity.Data.Configurations;

public sealed class ApprovalGrantConfiguration : IEntityTypeConfiguration<ApprovalGrant>
{
    public void Configure(EntityTypeBuilder<ApprovalGrant> builder)
    {
        ArgumentNullException.ThrowIfNull(builder);

        builder
            .ToTable("ApprovalGrants", IdentityModuleConstants.SchemaName)
            .HasKey(g => g.Id);

        builder.Property(g => g.Id).ValueGeneratedNever();

        // Hex SHA-256 of the bearer token; the token itself is never stored.
        builder.Property(g => g.TokenHash).IsRequired().HasMaxLength(64);
        builder.Property(g => g.Action).IsRequired().HasMaxLength(64);
        builder.Property(g => g.Amount).HasPrecision(18, 2);
        builder.Property(g => g.TargetRef).HasMaxLength(128);
        builder.Property(g => g.Reason).HasMaxLength(500);
        builder.Property(g => g.RequestedByUserId).IsRequired().HasMaxLength(450);
        builder.Property(g => g.RequestedByName).HasMaxLength(256);
        builder.Property(g => g.ApproverUserId).IsRequired().HasMaxLength(450);
        builder.Property(g => g.ApproverName).HasMaxLength(256);

        // Single use: the redeeming UPDATE carries "UsedAtUtc IS NULL", so two concurrent redemptions of the
        // same approval can't both succeed (the loser gets a concurrency failure and is refused).
        builder.Property(g => g.UsedAtUtc).IsConcurrencyToken();

        builder.HasIndex(g => g.TokenHash).IsUnique();
        builder.HasIndex(g => g.CreatedAtUtc);
    }
}
