using FSH.Framework.Core.Domain;

namespace FSH.Modules.Payroll.Domain;

/// <summary>
/// The tenant's payroll rates (one row per tenant, created with the defaults on first read). The defaults come from
/// <see cref="NepalPayrollDefaults"/>; tenants can edit them when the law changes before the software does.
/// </summary>
public sealed class PayrollSettings : AggregateRoot<Guid>
{
    public decimal EmployeeSsfRatePercent { get; private set; }
    public decimal EmployerSsfRatePercent { get; private set; }
    public decimal RetirementDeductionCap { get; private set; }
    public DateTime? UpdatedAtUtc { get; private set; }

    private PayrollSettings() { }

    public static PayrollSettings CreateDefault() => new()
    {
        Id = Guid.CreateVersion7(),
        EmployeeSsfRatePercent = NepalPayrollDefaults.EmployeeSsfRatePercent,
        EmployerSsfRatePercent = NepalPayrollDefaults.EmployerSsfRatePercent,
        RetirementDeductionCap = NepalPayrollDefaults.RetirementDeductionCap,
    };

    public void Update(decimal employeeSsfRatePercent, decimal employerSsfRatePercent, decimal retirementDeductionCap, DateTime nowUtc)
    {
        if (employeeSsfRatePercent is < 0 or > 100 || employerSsfRatePercent is < 0 or > 100 || retirementDeductionCap < 0)
        {
            throw new ArgumentException("SSF rates must be between 0 and 100 and the cap can't be negative.");
        }

        EmployeeSsfRatePercent = employeeSsfRatePercent;
        EmployerSsfRatePercent = employerSsfRatePercent;
        RetirementDeductionCap = retirementDeductionCap;
        UpdatedAtUtc = nowUtc;
    }

    /// <summary>The rates as the calculator takes them.</summary>
    public PayrollRates ToRates() => new(EmployeeSsfRatePercent, EmployerSsfRatePercent, RetirementDeductionCap);
}
