namespace FSH.Modules.Payroll.Domain;

/// <summary>The tenant's editable payroll rates.</summary>
public sealed record PayrollRates(decimal EmployeeSsfRatePercent, decimal EmployerSsfRatePercent, decimal RetirementDeductionCap);

/// <summary>A full month's pay from a salary structure.</summary>
public sealed record MonthlyPay(
    decimal Basic, decimal Grade, decimal DearnessAllowance, decimal OtherAllowance, decimal OtherDeduction, decimal Cit)
{
    public decimal Gross => Basic + Grade + DearnessAllowance + OtherAllowance;

    public static MonthlyPay From(SalaryStructure structure)
    {
        ArgumentNullException.ThrowIfNull(structure);
        return new(structure.Basic, structure.Grade, structure.DearnessAllowance, structure.OtherAllowance,
            structure.OtherDeduction, structure.CitContribution);
    }
}

/// <summary>What earlier recorded (approved / posted / paid) runs of the same fiscal year hold for an employee:
/// months covered, assessable income (gross + employer SSF), retirement contributions (SSF both sides + CIT) and
/// salary tax withheld.</summary>
public sealed record YearToDate(int Months, decimal Income, decimal RetirementContributions, decimal Tax)
{
    public static YearToDate None { get; } = new(0, 0m, 0m, 0m);
}

/// <summary>Everything one employee's monthly line depends on.</summary>
/// <param name="FullMonth">The salary structure's monthly figures.</param>
/// <param name="DaysWorked">Days of this month on the payroll (fewer than <paramref name="DaysInMonth"/> in the joining month).</param>
/// <param name="DaysInMonth">Days in the Nepali month.</param>
/// <param name="Married">Use the couple slabs.</param>
/// <param name="SsfEnrolled">The employee contributes to the SSF (SSF on basic; no 1% social security tax).</param>
/// <param name="RemainingMonths">This month through Ashadh, inclusive (12 in Shrawan, 1 in Ashadh).</param>
/// <param name="MissingElapsedMonths">Months of employment earlier in the fiscal year with no recorded run (payroll
/// started mid-year): assumed paid at the full monthly rate with their share of the year's tax already withheld.</param>
/// <param name="Prior">Year-to-date figures from earlier recorded runs.</param>
public sealed record PayrollLineInput(
    MonthlyPay FullMonth,
    int DaysWorked,
    int DaysInMonth,
    bool Married,
    bool SsfEnrolled,
    int RemainingMonths,
    int MissingElapsedMonths,
    YearToDate Prior);

public sealed record PayrollLineResult(
    decimal Basic,
    decimal Grade,
    decimal DearnessAllowance,
    decimal OtherAllowance,
    decimal Gross,
    decimal EmployeeSsf,
    decimal EmployerSsf,
    decimal Cit,
    decimal OtherDeduction,
    decimal SocialSecurityTax,
    decimal IncomeTax,
    decimal Net,
    decimal ProjectedAnnualIncome,
    decimal AnnualTaxableIncome,
    decimal AnnualTax,
    decimal IncomeThisMonth,
    decimal RetirementThisMonth)
{
    public decimal Tds => SocialSecurityTax + IncomeTax;
}

/// <summary>
/// Nepal monthly salary computation. Pure — no I/O — so every rule is unit-tested.
/// <list type="number">
///   <item>Earnings are pro-rated by days in the joining month; CIT and other deductions are not.</item>
///   <item>SSF (when enrolled) is the employee and employer rate of the (pro-rated) basic.</item>
///   <item>Assessable income = gross + employer SSF (the employer's contribution is a benefit, then deducted as a
///   retirement contribution). The year is projected: recorded months + missing earlier months at the full rate +
///   this month + the remaining months at the full rate.</item>
///   <item>Retirement deduction = the lesser of the year's contributions (SSF both sides + CIT), one-third of
///   assessable income and the cap. Taxable = assessable − deduction.</item>
///   <item>Annual tax by the slabs (single or couple); the first band's 1% is the social security tax, nil for SSF
///   contributors.</item>
///   <item>This month's tax = (annual tax − tax already withheld − the share assumed withheld for missing months) ÷
///   remaining months — annual ÷ 12 for a steady full-year salary, self-correcting after a raise, and settling the
///   whole balance in Ashadh. Never negative (an over-deduction is not refunded through payroll).</item>
/// </list>
/// Money is rounded to the paisa.
/// </summary>
public static class PayrollCalculator
{
    public static PayrollLineResult Compute(PayrollLineInput input, PayrollRates rates, SalaryTaxSchedule schedule)
    {
        ArgumentNullException.ThrowIfNull(input);
        ArgumentNullException.ThrowIfNull(rates);
        ArgumentNullException.ThrowIfNull(schedule);
        if (input.DaysInMonth <= 0 || input.DaysWorked < 0 || input.DaysWorked > input.DaysInMonth)
        {
            throw new ArgumentException("Days worked must be between 0 and the days in the month.", nameof(input));
        }

        if (input.RemainingMonths is < 1 or > 12)
        {
            throw new ArgumentException("Remaining months must be between 1 and 12.", nameof(input));
        }

        var full = input.FullMonth;
        decimal factor = input.DaysWorked == input.DaysInMonth ? 1m : (decimal)input.DaysWorked / input.DaysInMonth;

        decimal basic = Round(full.Basic * factor);
        decimal grade = Round(full.Grade * factor);
        decimal dearness = Round(full.DearnessAllowance * factor);
        decimal other = Round(full.OtherAllowance * factor);
        decimal gross = basic + grade + dearness + other;

        decimal employeeSsf = input.SsfEnrolled ? Round(basic * rates.EmployeeSsfRatePercent / 100m) : 0m;
        decimal employerSsf = input.SsfEnrolled ? Round(basic * rates.EmployerSsfRatePercent / 100m) : 0m;
        decimal cit = full.Cit;
        decimal otherDeduction = full.OtherDeduction;

        decimal fullEmployeeSsf = input.SsfEnrolled ? Round(full.Basic * rates.EmployeeSsfRatePercent / 100m) : 0m;
        decimal fullEmployerSsf = input.SsfEnrolled ? Round(full.Basic * rates.EmployerSsfRatePercent / 100m) : 0m;
        decimal fullIncome = full.Gross + fullEmployerSsf;
        decimal fullRetirement = fullEmployeeSsf + fullEmployerSsf + full.Cit;

        decimal incomeThisMonth = gross + employerSsf;
        decimal retirementThisMonth = employeeSsf + employerSsf + cit;

        int futureMonths = input.RemainingMonths - 1;
        decimal projectedIncome = input.Prior.Income + (input.MissingElapsedMonths * fullIncome) + incomeThisMonth + (futureMonths * fullIncome);
        decimal projectedRetirement = input.Prior.RetirementContributions + (input.MissingElapsedMonths * fullRetirement)
            + retirementThisMonth + (futureMonths * fullRetirement);

        decimal deduction = Math.Min(
            projectedRetirement,
            Math.Min(projectedIncome * NepalPayrollDefaults.RetirementDeductionIncomeShare, rates.RetirementDeductionCap));
        decimal taxable = Round(Math.Max(0m, projectedIncome - Math.Max(0m, deduction)));

        var (annualSst, annualIncomeTax) = AnnualTax(taxable, input.Married ? schedule.MarriedBands : schedule.SingleBands, input.SsfEnrolled);
        decimal annualTax = annualSst + annualIncomeTax;

        int employmentMonths = input.Prior.Months + input.MissingElapsedMonths + input.RemainingMonths;
        decimal assumedWithheld = employmentMonths == 0 ? 0m : annualTax * input.MissingElapsedMonths / employmentMonths;
        decimal monthTax = Round(Math.Max(0m, (annualTax - input.Prior.Tax - assumedWithheld) / input.RemainingMonths));

        decimal monthSst = annualTax == 0m ? 0m : Round(monthTax * annualSst / annualTax);
        decimal monthIncomeTax = monthTax - monthSst;

        decimal net = gross - employeeSsf - cit - monthTax - otherDeduction;

        return new PayrollLineResult(
            basic, grade, dearness, other, gross, employeeSsf, employerSsf, cit, otherDeduction,
            monthSst, monthIncomeTax, net,
            Round(projectedIncome), taxable, annualTax, incomeThisMonth, retirementThisMonth);
    }

    /// <summary>Tax on a year's taxable income: the social security tax (the first band, nil when
    /// <paramref name="ssfEnrolled"/>) and the income tax (every later band).</summary>
    public static (decimal SocialSecurityTax, decimal IncomeTax) AnnualTax(decimal taxable, IReadOnlyList<TaxBand> bands, bool ssfEnrolled)
    {
        ArgumentNullException.ThrowIfNull(bands);

        decimal remaining = Math.Max(0m, taxable);
        decimal sst = 0m;
        decimal incomeTax = 0m;
        for (int i = 0; i < bands.Count && remaining > 0m; i++)
        {
            decimal portion = bands[i].Width is { } width ? Math.Min(remaining, width) : remaining;
            decimal tax = portion * bands[i].RatePercent / 100m;
            if (i == 0)
            {
                sst = ssfEnrolled ? 0m : tax;
            }
            else
            {
                incomeTax += tax;
            }

            remaining -= portion;
        }

        return (Round(sst), Round(incomeTax));
    }

    public static decimal Round(decimal value) => decimal.Round(value, 2, MidpointRounding.AwayFromZero);
}
