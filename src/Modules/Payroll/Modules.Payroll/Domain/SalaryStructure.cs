using FSH.Framework.Core.Domain;

namespace FSH.Modules.Payroll.Domain;

/// <summary>
/// An employee's monthly pay from <see cref="EffectiveFrom"/> (AD date) until a later structure takes over. Kept as
/// history: a raise adds a new structure rather than editing the old one, so earlier runs stay explainable.
/// SSF is computed on <see cref="Basic"/>; <see cref="CitContribution"/> is the employee's optional monthly Citizen
/// Investment Trust contribution and <see cref="OtherDeduction"/> any other monthly deduction (advance recovery, …).
/// </summary>
public sealed class SalaryStructure : AggregateRoot<Guid>
{
    public const int NotesMaxLength = 500;

    public Guid EmployeeId { get; private set; }
    public DateOnly EffectiveFrom { get; private set; }
    public decimal Basic { get; private set; }
    public decimal Grade { get; private set; }
    public decimal DearnessAllowance { get; private set; }
    public decimal OtherAllowance { get; private set; }
    public decimal OtherDeduction { get; private set; }
    public decimal CitContribution { get; private set; }
    public string? Notes { get; private set; }
    public DateTime CreatedAtUtc { get; private set; }

    /// <summary>Monthly gross: basic + grade + dearness + other allowances.</summary>
    public decimal Gross => Basic + Grade + DearnessAllowance + OtherAllowance;

    private SalaryStructure() { }

    public static SalaryStructure Create(
        Guid employeeId, DateOnly effectiveFrom, decimal basic, decimal grade, decimal dearnessAllowance,
        decimal otherAllowance, decimal otherDeduction, decimal citContribution, string? notes, DateTime nowUtc)
    {
        if (basic < 0 || grade < 0 || dearnessAllowance < 0 || otherAllowance < 0 || otherDeduction < 0 || citContribution < 0)
        {
            throw new ArgumentException("Salary amounts can't be negative.");
        }

        return new SalaryStructure
        {
            Id = Guid.CreateVersion7(),
            EmployeeId = employeeId,
            EffectiveFrom = effectiveFrom,
            Basic = Round(basic),
            Grade = Round(grade),
            DearnessAllowance = Round(dearnessAllowance),
            OtherAllowance = Round(otherAllowance),
            OtherDeduction = Round(otherDeduction),
            CitContribution = Round(citContribution),
            Notes = string.IsNullOrWhiteSpace(notes) ? null : notes.Trim(),
            CreatedAtUtc = nowUtc,
        };
    }

    private static decimal Round(decimal value) => decimal.Round(value, 2, MidpointRounding.AwayFromZero);
}
