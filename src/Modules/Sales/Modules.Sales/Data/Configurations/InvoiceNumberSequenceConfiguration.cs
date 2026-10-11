using FSH.Modules.Sales.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace FSH.Modules.Sales.Data.Configurations;

public sealed class InvoiceNumberSequenceConfiguration : IEntityTypeConfiguration<InvoiceNumberSequence>
{
    public void Configure(EntityTypeBuilder<InvoiceNumberSequence> builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        builder.ToTable("InvoiceNumberSequences");
        builder.HasKey(x => x.Id);
        // TenantId is the Finbuckle shadow column, declared here so the unique index (the upsert
        // conflict target) exists before BaseDbContext applies tenant isolation.
        builder.Property<string>("TenantId").IsRequired();
        // Existing rows are all invoice counters, hence the default.
        builder.Property(x => x.Series).HasMaxLength(8).HasDefaultValue(InvoiceSeries.Invoice);
        builder.HasIndex(
            "TenantId", nameof(InvoiceNumberSequence.BranchId), nameof(InvoiceNumberSequence.Series), nameof(InvoiceNumberSequence.FiscalYear))
            .IsUnique();
        builder.Ignore(x => x.DomainEvents);
    }
}
