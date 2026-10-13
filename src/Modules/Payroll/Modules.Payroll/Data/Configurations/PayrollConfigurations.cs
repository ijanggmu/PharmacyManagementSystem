using FSH.Modules.Payroll.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace FSH.Modules.Payroll.Data.Configurations;

public sealed class EmployeeConfiguration : IEntityTypeConfiguration<Employee>
{
    public void Configure(EntityTypeBuilder<Employee> builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        builder.ToTable("Employees");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.FullName).HasMaxLength(Employee.NameMaxLength).IsRequired();
        builder.Property(x => x.Designation).HasMaxLength(Employee.TextMaxLength);
        builder.Property(x => x.Pan).HasMaxLength(32);
        builder.Property(x => x.SsfNumber).HasMaxLength(64);
        builder.Property(x => x.BankName).HasMaxLength(Employee.TextMaxLength);
        builder.Property(x => x.BankAccountNumber).HasMaxLength(64);
        builder.Property(x => x.MaritalStatus).HasMaxLength(16).IsRequired();
        builder.HasIndex(x => x.BranchId);
        builder.HasIndex(x => x.UserId);
        builder.Ignore(x => x.DomainEvents);
    }
}

public sealed class SalaryStructureConfiguration : IEntityTypeConfiguration<SalaryStructure>
{
    public void Configure(EntityTypeBuilder<SalaryStructure> builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        builder.ToTable("SalaryStructures");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Basic).HasPrecision(18, 2);
        builder.Property(x => x.Grade).HasPrecision(18, 2);
        builder.Property(x => x.DearnessAllowance).HasPrecision(18, 2);
        builder.Property(x => x.OtherAllowance).HasPrecision(18, 2);
        builder.Property(x => x.OtherDeduction).HasPrecision(18, 2);
        builder.Property(x => x.CitContribution).HasPrecision(18, 2);
        builder.Property(x => x.Notes).HasMaxLength(SalaryStructure.NotesMaxLength);
        builder.HasOne<Employee>().WithMany().HasForeignKey(x => x.EmployeeId).OnDelete(DeleteBehavior.Restrict);

        // One structure per employee per effective date. TenantId is the multitenancy shadow property.
        builder.Property<string>("TenantId");
        builder.HasIndex("TenantId", nameof(SalaryStructure.EmployeeId), nameof(SalaryStructure.EffectiveFrom)).IsUnique();
        builder.Ignore(x => x.Gross);
        builder.Ignore(x => x.DomainEvents);
    }
}

public sealed class PayrollSettingsConfiguration : IEntityTypeConfiguration<PayrollSettings>
{
    public void Configure(EntityTypeBuilder<PayrollSettings> builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        builder.ToTable("Settings");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.EmployeeSsfRatePercent).HasPrecision(5, 2);
        builder.Property(x => x.EmployerSsfRatePercent).HasPrecision(5, 2);
        builder.Property(x => x.RetirementDeductionCap).HasPrecision(18, 2);

        // One settings row per tenant.
        builder.Property<string>("TenantId");
        builder.HasIndex("TenantId").IsUnique();
        builder.Ignore(x => x.DomainEvents);
    }
}

public sealed class PayrollRunConfiguration : IEntityTypeConfiguration<PayrollRun>
{
    private static readonly string[] Money =
    [
        nameof(PayrollRun.TotalGross), nameof(PayrollRun.TotalEmployeeSsf), nameof(PayrollRun.TotalEmployerSsf),
        nameof(PayrollRun.TotalCit), nameof(PayrollRun.TotalOtherDeductions), nameof(PayrollRun.TotalSocialSecurityTax),
        nameof(PayrollRun.TotalIncomeTax), nameof(PayrollRun.TotalNet),
    ];

    public void Configure(EntityTypeBuilder<PayrollRun> builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        builder.ToTable("Runs");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Status).HasMaxLength(16).IsRequired();
        builder.Property(x => x.PreparedBy).HasMaxLength(PayrollRun.UserMaxLength);
        builder.Property(x => x.ApprovedBy).HasMaxLength(PayrollRun.UserMaxLength);
        builder.Property(x => x.PostedBy).HasMaxLength(PayrollRun.UserMaxLength);
        builder.Property(x => x.PaidBy).HasMaxLength(PayrollRun.UserMaxLength);
        builder.Property(x => x.PaymentMethod).HasMaxLength(PayrollRun.PaymentMethodMaxLength);
        foreach (string money in Money)
        {
            builder.Property<decimal>(money).HasPrecision(18, 2);
        }

        // One run per branch and Nepali month.
        builder.Property<string>("TenantId");
        builder.HasIndex("TenantId", nameof(PayrollRun.BranchId), nameof(PayrollRun.BsYear), nameof(PayrollRun.BsMonth)).IsUnique();
        builder.HasIndex(x => new { x.FiscalYearStart, x.MonthOfFiscalYear });

        builder.HasMany(x => x.Lines).WithOne().HasForeignKey(l => l.RunId).OnDelete(DeleteBehavior.Cascade);
        builder.Navigation(x => x.Lines).UsePropertyAccessMode(PropertyAccessMode.Field);
        builder.Ignore(x => x.TotalTds);
        builder.Ignore(x => x.DomainEvents);
    }
}

public sealed class PayrollRunLineConfiguration : IEntityTypeConfiguration<PayrollRunLine>
{
    private static readonly string[] Money =
    [
        nameof(PayrollRunLine.Basic), nameof(PayrollRunLine.Grade), nameof(PayrollRunLine.DearnessAllowance),
        nameof(PayrollRunLine.OtherAllowance), nameof(PayrollRunLine.Gross), nameof(PayrollRunLine.EmployeeSsf),
        nameof(PayrollRunLine.EmployerSsf), nameof(PayrollRunLine.Cit), nameof(PayrollRunLine.OtherDeduction),
        nameof(PayrollRunLine.SocialSecurityTax), nameof(PayrollRunLine.IncomeTax), nameof(PayrollRunLine.Net),
        nameof(PayrollRunLine.ProjectedAnnualIncome), nameof(PayrollRunLine.AnnualTaxableIncome),
        nameof(PayrollRunLine.AnnualTax), nameof(PayrollRunLine.AssessableIncome),
        nameof(PayrollRunLine.RetirementContribution),
    ];

    public void Configure(EntityTypeBuilder<PayrollRunLine> builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        builder.ToTable("RunLines");
        builder.HasKey(x => x.Id);

        // Reached only through PayrollRun.Lines (database.md nav-child footgun).
        builder.Property(x => x.Id).ValueGeneratedNever();

        builder.Property(x => x.EmployeeName).HasMaxLength(Employee.NameMaxLength).IsRequired();
        builder.Property(x => x.Designation).HasMaxLength(Employee.TextMaxLength);
        builder.Property(x => x.Pan).HasMaxLength(32);
        builder.Property(x => x.SsfNumber).HasMaxLength(64);
        builder.Property(x => x.BankName).HasMaxLength(Employee.TextMaxLength);
        builder.Property(x => x.BankAccountNumber).HasMaxLength(64);
        builder.Property(x => x.MaritalStatus).HasMaxLength(16).IsRequired();
        foreach (string money in Money)
        {
            builder.Property<decimal>(money).HasPrecision(18, 2);
        }

        builder.HasIndex(x => x.EmployeeId);
        builder.Ignore(x => x.Tds);
        builder.Ignore(x => x.DomainEvents);
    }
}
