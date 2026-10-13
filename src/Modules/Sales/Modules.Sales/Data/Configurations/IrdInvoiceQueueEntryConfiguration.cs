using FSH.Modules.Sales.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace FSH.Modules.Sales.Data.Configurations;

public sealed class IrdInvoiceQueueEntryConfiguration : IEntityTypeConfiguration<IrdInvoiceQueueEntry>
{
    public void Configure(EntityTypeBuilder<IrdInvoiceQueueEntry> builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        builder.ToTable("IrdInvoiceQueues");
        builder.HasKey(x => x.Id);

        builder.Property(x => x.PayloadJson).HasColumnType("jsonb").IsRequired();
        builder.Property(x => x.Status).HasConversion<string>().HasMaxLength(16);
        builder.Property(x => x.DocumentType).HasConversion<string>().HasMaxLength(16);
        builder.Property(x => x.DocumentNumber).HasMaxLength(100);
        builder.Property(x => x.ResponseCode).HasMaxLength(32);
        builder.Property(x => x.LastError).HasMaxLength(2000);

        builder.HasIndex(x => x.SaleId);
        builder.HasIndex(x => x.Status);
        builder.HasIndex(x => new { x.Status, x.NextAttemptAtUtc });
        builder.HasIndex(x => new { x.DocumentType, x.DocumentId });

        builder.HasOne<Sale>().WithMany().HasForeignKey(x => x.SaleId).OnDelete(DeleteBehavior.Restrict);
        builder.Ignore(x => x.DomainEvents);
    }
}

public sealed class IrdSettingsConfiguration : IEntityTypeConfiguration<IrdSettings>
{
    public void Configure(EntityTypeBuilder<IrdSettings> builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        builder.ToTable("IrdSettings");
        builder.HasKey(x => x.Id);

        builder.Property(x => x.BaseUrl).HasMaxLength(300);
        builder.Property(x => x.Username).HasMaxLength(128);
        builder.Property(x => x.PasswordProtected).HasColumnType("text");
        builder.Property(x => x.SellerPan).HasMaxLength(20);
        builder.Property(x => x.AbbreviatedInvoiceThreshold).HasPrecision(18, 2);

        builder.Ignore(x => x.IsConfigured);
        builder.Ignore(x => x.DomainEvents);
    }
}
