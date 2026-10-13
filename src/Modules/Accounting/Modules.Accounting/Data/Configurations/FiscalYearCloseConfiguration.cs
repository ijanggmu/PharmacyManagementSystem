using FSH.Modules.Accounting.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace FSH.Modules.Accounting.Data.Configurations;

public sealed class FiscalYearCloseConfiguration : IEntityTypeConfiguration<FiscalYearClose>
{
    public void Configure(EntityTypeBuilder<FiscalYearClose> builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        builder.ToTable("FiscalYearCloses");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.NetProfit).HasPrecision(18, 2);
        builder.Property(x => x.ClosedBy).IsRequired().HasMaxLength(256);

        // One close per tenant and fiscal year: a concurrent second close fails on save instead of posting its
        // closing vouchers twice. TenantId is the multitenancy shadow property; declared here so the index can name it.
        builder.Property<string>("TenantId");
        builder.HasIndex("TenantId", nameof(FiscalYearClose.FiscalYear)).IsUnique();
        builder.Ignore(x => x.DomainEvents);
    }
}
