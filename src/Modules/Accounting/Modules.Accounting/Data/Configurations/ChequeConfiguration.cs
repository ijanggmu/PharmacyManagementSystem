using FSH.Modules.Accounting.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace FSH.Modules.Accounting.Data.Configurations;

public sealed class ChequeConfiguration : IEntityTypeConfiguration<Cheque>
{
    public void Configure(EntityTypeBuilder<Cheque> builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        builder.ToTable("Cheques");
        builder.HasKey(x => x.Id);

        builder.Property(x => x.Direction).HasConversion<string>().HasMaxLength(16);
        builder.Property(x => x.Status).HasConversion<string>().HasMaxLength(16);
        builder.Property(x => x.PartyName).IsRequired().HasMaxLength(Cheque.PartyNameMaxLength);
        builder.Property(x => x.BankName).HasMaxLength(Cheque.BankNameMaxLength);
        builder.Property(x => x.ChequeNumber).IsRequired().HasMaxLength(Cheque.ChequeNumberMaxLength);
        builder.Property(x => x.Amount).HasPrecision(18, 2);
        builder.Property(x => x.PaymentReferenceType).IsRequired().HasMaxLength(64);
        builder.Property(x => x.Notes).HasMaxLength(Cheque.NoteMaxLength);

        // One register entry per payment (the event handler's redelivery check relies on it). TenantId is the
        // multitenancy shadow property; declared here so the index can name it.
        builder.Property<string>("TenantId");
        builder.HasIndex("TenantId", nameof(Cheque.PaymentReferenceType), nameof(Cheque.PaymentReferenceId)).IsUnique();

        // The register's filters: status + cheque date (the due list), direction, party.
        builder.HasIndex(x => new { x.Status, x.ChequeDateUtc });
        builder.HasIndex(x => x.Direction);
        builder.HasIndex(x => x.PartyId);
        builder.HasIndex(x => x.BranchId);

        builder.HasMany(x => x.History)
            .WithOne()
            .HasForeignKey(h => h.ChequeId)
            .OnDelete(DeleteBehavior.Cascade);
        builder.Navigation(x => x.History).UsePropertyAccessMode(PropertyAccessMode.Field);

        builder.HasOne<AccountingAccount>().WithMany().HasForeignKey(x => x.BankAccountId).OnDelete(DeleteBehavior.Restrict);
        builder.Ignore(x => x.DomainEvents);
    }
}

public sealed class ChequeStatusChangeConfiguration : IEntityTypeConfiguration<ChequeStatusChange>
{
    public void Configure(EntityTypeBuilder<ChequeStatusChange> builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        builder.ToTable("ChequeStatusChanges");
        builder.HasKey(x => x.Id);

        // Reached only through Cheque.History — without this EF treats a new row as Modified (database.md).
        builder.Property(x => x.Id).ValueGeneratedNever();

        builder.Property(x => x.FromStatus).HasConversion<string>().HasMaxLength(16);
        builder.Property(x => x.ToStatus).HasConversion<string>().HasMaxLength(16);
        builder.Property(x => x.ChangedBy).IsRequired().HasMaxLength(256);
        builder.Property(x => x.Note).HasMaxLength(Cheque.NoteMaxLength);

        builder.HasIndex(x => x.ChequeId);
        builder.Ignore(x => x.DomainEvents);
    }
}
