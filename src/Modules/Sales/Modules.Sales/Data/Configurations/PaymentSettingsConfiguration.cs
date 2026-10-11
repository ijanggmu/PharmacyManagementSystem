using FSH.Modules.Sales.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace FSH.Modules.Sales.Data.Configurations;

public sealed class PaymentSettingsConfiguration : IEntityTypeConfiguration<PaymentSettings>
{
    public void Configure(EntityTypeBuilder<PaymentSettings> builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        builder.ToTable("PaymentSettings");
        builder.HasKey(x => x.Id);

        builder.Property(x => x.BankName).HasMaxLength(150);
        builder.Property(x => x.AccountName).HasMaxLength(150);
        builder.Property(x => x.AccountNumber).HasMaxLength(64);
        builder.Property(x => x.BankQrImage).HasColumnType("text");
        builder.Property(x => x.FonepayMerchantCode).HasMaxLength(64);
        builder.Property(x => x.FonepayUsername).HasMaxLength(128);
        builder.Property(x => x.FonepayEnvironment).HasMaxLength(8).IsRequired();
        builder.Property(x => x.FonepayPasswordProtected).HasColumnType("text");
        builder.Property(x => x.FonepaySecretKeyProtected).HasColumnType("text");

        builder.Ignore(x => x.IsFonepayConfigured);
        builder.Ignore(x => x.DomainEvents);
    }
}

public sealed class FonepayQrRequestConfiguration : IEntityTypeConfiguration<FonepayQrRequest>
{
    public void Configure(EntityTypeBuilder<FonepayQrRequest> builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        builder.ToTable("FonepayQrRequests");
        builder.HasKey(x => x.Id);

        builder.Property(x => x.Prn).HasMaxLength(50).IsRequired();
        builder.Property(x => x.Amount).HasPrecision(18, 2);
        builder.Property(x => x.Environment).HasMaxLength(8).IsRequired();
        builder.Property(x => x.Status).HasConversion<string>().HasMaxLength(16);
        builder.Property(x => x.TraceId).HasMaxLength(100);
        builder.Property(x => x.Message).HasMaxLength(500);

        builder.HasIndex(x => x.Prn).IsUnique();
        builder.HasIndex(x => x.CreatedAtUtc);

        builder.Ignore(x => x.DomainEvents);
    }
}
