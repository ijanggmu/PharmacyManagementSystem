using FSH.Modules.Notifications.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace FSH.Modules.Notifications.Data.Configurations;

internal sealed class SmsSettingsConfiguration : IEntityTypeConfiguration<SmsSettings>
{
    public void Configure(EntityTypeBuilder<SmsSettings> builder)
    {
        builder.ToTable("SmsSettings");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Id).ValueGeneratedNever();

        builder.Property(x => x.Provider).HasMaxLength(16).IsRequired();
        builder.Property(x => x.SenderId).HasMaxLength(32);
        builder.Property(x => x.ApiTokenProtected).HasColumnType("text");
        builder.Property(x => x.PharmacyName).HasMaxLength(80);
        builder.Property(x => x.DefaultLanguage).HasMaxLength(8).IsRequired();

        builder.Ignore(x => x.IsConfigured);
        builder.Ignore(x => x.DomainEvents);
    }
}

internal sealed class SmsTemplateConfiguration : IEntityTypeConfiguration<SmsTemplate>
{
    public void Configure(EntityTypeBuilder<SmsTemplate> builder)
    {
        builder.ToTable("SmsTemplates");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Id).ValueGeneratedNever();

        builder.Property(x => x.Kind).HasMaxLength(32).IsRequired();
        builder.Property(x => x.Language).HasMaxLength(8).IsRequired();
        builder.Property(x => x.Body).HasMaxLength(1000).IsRequired();

        builder.Property<string>("TenantId");
        builder.HasIndex("TenantId", nameof(SmsTemplate.Kind), nameof(SmsTemplate.Language)).IsUnique();

        builder.Ignore(x => x.DomainEvents);
    }
}

internal sealed class SmsMessageConfiguration : IEntityTypeConfiguration<SmsMessage>
{
    public void Configure(EntityTypeBuilder<SmsMessage> builder)
    {
        builder.ToTable("SmsMessages");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Id).ValueGeneratedNever();

        builder.Property(x => x.Kind).HasMaxLength(32).IsRequired();
        builder.Property(x => x.Trigger).HasConversion<string>().HasMaxLength(16);
        builder.Property(x => x.Status).HasConversion<string>().HasMaxLength(16);
        builder.Property(x => x.RecipientName).HasMaxLength(256);
        builder.Property(x => x.Phone).HasMaxLength(20).IsRequired();
        builder.Property(x => x.Body).HasMaxLength(1000).IsRequired();
        builder.Property(x => x.Language).HasMaxLength(8).IsRequired();
        builder.Property(x => x.Encoding).HasMaxLength(16).IsRequired();
        builder.Property(x => x.Provider).HasMaxLength(16).IsRequired();
        builder.Property(x => x.ReferenceKeys).HasColumnType("text");
        builder.Property(x => x.LastError).HasMaxLength(1000);
        builder.Property(x => x.ResponseCode).HasMaxLength(32);
        builder.Property(x => x.ResponseMessage).HasMaxLength(500);
        builder.Property(x => x.ProviderMessageId).HasMaxLength(100);
        builder.Property(x => x.Credits).HasPrecision(18, 4);
        builder.Property(x => x.RequestedBy).HasMaxLength(64);

        // The queue: due items by status; the log: newest first; dedupe: a customer's recent reminders of a kind.
        builder.HasIndex(x => new { x.Status, x.NextAttemptAtUtc });
        builder.HasIndex(x => x.CreatedAtUtc);
        builder.HasIndex(x => new { x.CustomerId, x.Kind, x.CreatedAtUtc });

        builder.Ignore(x => x.DomainEvents);
    }
}
