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
        builder.Property(x => x.LastError).HasMaxLength(2000);

        builder.HasIndex(x => x.SaleId);
        builder.HasIndex(x => x.Status);
        builder.HasIndex(x => new { x.Status, x.NextAttemptAtUtc });

        builder.HasOne<Sale>().WithMany().HasForeignKey(x => x.SaleId).OnDelete(DeleteBehavior.Restrict);
        builder.Ignore(x => x.DomainEvents);
    }
}
