namespace FSH.Modules.Payroll.Domain;

/// <summary>One band of a progressive tax schedule: the next <see cref="Width"/> rupees of taxable income (null = all
/// the rest) are taxed at <see cref="RatePercent"/>.</summary>
public sealed record TaxBand(decimal? Width, decimal RatePercent);

/// <summary>The salary tax schedule in force from fiscal year <see cref="FromFiscalYear"/> (BS start year, e.g. 2081
/// for 2081/82). The first band of each schedule is the 1% social security tax band.</summary>
public sealed record SalaryTaxSchedule(int FromFiscalYear, string Source, IReadOnlyList<TaxBand> SingleBands, IReadOnlyList<TaxBand> MarriedBands);

/// <summary>
/// Nepal payroll defaults — the ONE place the statutory rates and slabs live.
/// <para><b>Verify every figure here against the current Finance Act / Income Tax Act 2058 (Schedule 1) and the
/// Social Security Act 2074 before relying on it.</b> The SSF rates and the retirement deduction cap are only
/// defaults: tenants can edit them in Payroll settings. The slabs are code: add a new <see cref="SalaryTaxSchedule"/>
/// row when a Finance Act changes them (a fiscal year uses the latest row whose <c>FromFiscalYear</c> is not after it).</para>
/// </summary>
public static class NepalPayrollDefaults
{
    /// <summary>Employee SSF contribution: 11% of basic salary (Social Security Act 2074 / contribution-based scheme).</summary>
    public const decimal EmployeeSsfRatePercent = 11m;

    /// <summary>Employer SSF contribution: 20% of basic salary (11% + 20% = 31% deposited with the SSF).</summary>
    public const decimal EmployerSsfRatePercent = 20m;

    /// <summary>Yearly cap on deductible retirement contributions (SSF + CIT / approved retirement fund): the lesser of
    /// one-third of assessable income and Rs 5,00,000 (Income Tax Act s.63, as amended).</summary>
    public const decimal RetirementDeductionCap = 500_000m;

    /// <summary>The share of assessable income retirement contributions may reduce it by (one-third).</summary>
    public const decimal RetirementDeductionIncomeShare = 1m / 3m;

    public const string Note =
        "Defaults: SSF 11% employee + 20% employer of basic salary (31% deposited); retirement contributions " +
        "(SSF + CIT) deductible up to the lesser of one-third of income and Rs 5,00,000 a year. Confirm these and the " +
        "tax slabs against the current Finance Act, Income Tax Act and Social Security Act before paying salaries.";

    /// <summary>
    /// Individual salary tax slabs. Unchanged since FY 2080/81 as far as encoded here (Finance Acts 2080–2082):
    /// single — first Rs 5,00,000 at 1%, next 2,00,000 at 10%, next 3,00,000 at 20%, up to 20,00,000 at 30%, up to
    /// 50,00,000 at 36%, above at 39%; married (couple) — first Rs 6,00,000 at 1%, next 2,00,000 at 10%, next
    /// 3,00,000 at 20%, up to 20,00,000 at 30%, up to 50,00,000 at 36%, above at 39%. The 1% first band is the social
    /// security tax, waived for SSF contributors. VERIFY against the Finance Act of the year being paid.
    /// </summary>
    public static IReadOnlyList<SalaryTaxSchedule> Schedules { get; } =
    [
        new(
            FromFiscalYear: 2080,
            Source: "Income Tax Act 2058 Schedule 1 as amended by the Finance Acts 2080–2082 — verify against the current Finance Act",
            SingleBands:
            [
                new(500_000m, 1m),
                new(200_000m, 10m),
                new(300_000m, 20m),
                new(1_000_000m, 30m),
                new(3_000_000m, 36m),
                new(null, 39m),
            ],
            MarriedBands:
            [
                new(600_000m, 1m),
                new(200_000m, 10m),
                new(300_000m, 20m),
                new(900_000m, 30m),
                new(3_000_000m, 36m),
                new(null, 39m),
            ]),
    ];

    /// <summary>The schedule for fiscal year <paramref name="fiscalYearStart"/> (BS start year): the latest row not after
    /// it, or the earliest row for older years.</summary>
    public static SalaryTaxSchedule ScheduleFor(int fiscalYearStart) =>
        Schedules.Where(s => s.FromFiscalYear <= fiscalYearStart).MaxBy(s => s.FromFiscalYear) ?? Schedules[0];
}
