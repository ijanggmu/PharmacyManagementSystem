using FSH.Modules.Payroll.Domain;

namespace Payroll.Tests.Domain;

/// <summary>Nepal salary tax, SSF and CIT math — the figures are worked by hand in the comments.</summary>
public sealed class PayrollCalculatorTests
{
    private static readonly PayrollRates Rates = new(11m, 20m, 500_000m);
    private static readonly SalaryTaxSchedule Schedule = NepalPayrollDefaults.ScheduleFor(2082);

    private static PayrollLineInput Input(
        MonthlyPay pay, bool married = false, bool ssf = false, int remaining = 12, int missing = 0,
        YearToDate? prior = null, int daysWorked = 30, int daysInMonth = 30) =>
        new(pay, daysWorked, daysInMonth, married, ssf, remaining, missing, prior ?? YearToDate.None);

    private static MonthlyPay Basic(decimal basic, decimal dearness = 0m, decimal cit = 0m, decimal other = 0m) =>
        new(basic, Grade: 0m, dearness, OtherAllowance: 0m, OtherDeduction: other, cit);

    #region Slabs

    [Fact]
    public void AnnualTax_Should_ApplySingleSlabs_With_SocialSecurityTax_On_FirstBand()
    {
        // 5L @1% = 5,000 SST; 2L @10% = 20,000; 3L @20% = 60,000; 2L @30% = 60,000.
        var (sst, incomeTax) = PayrollCalculator.AnnualTax(1_200_000m, Schedule.SingleBands, ssfEnrolled: false);

        sst.ShouldBe(5_000m);
        incomeTax.ShouldBe(140_000m);
    }

    [Fact]
    public void AnnualTax_Should_ApplyMarriedSlabs()
    {
        // 6L @1% = 6,000 SST; 2L @10% = 20,000; 3L @20% = 60,000; 1L @30% = 30,000.
        var (sst, incomeTax) = PayrollCalculator.AnnualTax(1_200_000m, Schedule.MarriedBands, ssfEnrolled: false);

        sst.ShouldBe(6_000m);
        incomeTax.ShouldBe(110_000m);
    }

    [Fact]
    public void AnnualTax_Should_WaiveSocialSecurityTax_When_SsfEnrolled()
    {
        var (sst, incomeTax) = PayrollCalculator.AnnualTax(1_200_000m, Schedule.SingleBands, ssfEnrolled: true);

        sst.ShouldBe(0m);
        incomeTax.ShouldBe(140_000m);
    }

    [Fact]
    public void AnnualTax_Should_ApplyTopBands_Above_FiftyLakh()
    {
        // 5,000 + 20,000 + 60,000 + 10L @30% = 300,000 + 30L @36% = 1,080,000 + 10L @39% = 390,000.
        var (sst, incomeTax) = PayrollCalculator.AnnualTax(6_000_000m, Schedule.SingleBands, ssfEnrolled: false);

        sst.ShouldBe(5_000m);
        incomeTax.ShouldBe(1_850_000m);
    }

    [Fact]
    public void AnnualTax_Should_BeZero_For_NoIncome()
    {
        PayrollCalculator.AnnualTax(0m, Schedule.SingleBands, ssfEnrolled: false).ShouldBe((0m, 0m));
    }

    [Fact]
    public void ScheduleFor_Should_UseLatestRowNotAfterTheYear()
    {
        NepalPayrollDefaults.ScheduleFor(2083).FromFiscalYear.ShouldBe(2080);
        NepalPayrollDefaults.ScheduleFor(2070).ShouldBe(NepalPayrollDefaults.Schedules[0]);
    }

    #endregion

    #region Monthly

    [Fact]
    public void Compute_Should_TakeTwelfthOfAnnualTax_For_FullYearSingle()
    {
        var r = PayrollCalculator.Compute(Input(Basic(100_000m)), Rates, Schedule);

        r.Gross.ShouldBe(100_000m);
        r.ProjectedAnnualIncome.ShouldBe(1_200_000m);
        r.AnnualTaxableIncome.ShouldBe(1_200_000m);
        r.AnnualTax.ShouldBe(145_000m);
        r.Tds.ShouldBe(12_083.33m);
        r.SocialSecurityTax.ShouldBe(416.67m); // 12,083.33 × 5,000 / 145,000
        r.IncomeTax.ShouldBe(11_666.66m);
        r.EmployeeSsf.ShouldBe(0m);
        r.Net.ShouldBe(87_916.67m);
    }

    [Fact]
    public void Compute_Should_DeductSsfAndCit_And_ExemptSocialSecurityTax_When_Married_SsfEnrolled()
    {
        // Basic 60,000 + dearness 10,000 = gross 70,000. SSF 11% = 6,600 (employee), 20% = 12,000 (employer).
        // Income 82,000/month = 984,000/yr. Retirement 6,600 + 12,000 + CIT 5,000 = 23,600/month = 283,200/yr
        // (< 1/3 of income 328,000 and < 5L cap). Taxable 700,800: 6L @1% waived (SSF), 100,800 @10% = 10,080/yr.
        var r = PayrollCalculator.Compute(Input(Basic(60_000m, dearness: 10_000m, cit: 5_000m), married: true, ssf: true), Rates, Schedule);

        r.Gross.ShouldBe(70_000m);
        r.EmployeeSsf.ShouldBe(6_600m);
        r.EmployerSsf.ShouldBe(12_000m);
        r.Cit.ShouldBe(5_000m);
        r.AnnualTaxableIncome.ShouldBe(700_800m);
        r.AnnualTax.ShouldBe(10_080m);
        r.SocialSecurityTax.ShouldBe(0m);
        r.Tds.ShouldBe(840m);
        r.Net.ShouldBe(70_000m - 6_600m - 5_000m - 840m);
        r.RetirementThisMonth.ShouldBe(23_600m);
        r.IncomeThisMonth.ShouldBe(82_000m);
    }

    [Fact]
    public void Compute_Should_CapRetirementDeduction_At_FiveLakh()
    {
        // Basic two lakh with SSF and a CIT of thirty thousand: income is 2.88 million a year and contributions 1.104
        // million; one-third of income is 960 thousand, so the five lakh cap applies. Taxable 2.38 million: first band
        // waived, then twenty, sixty and three hundred thousand, plus 36 percent of 380 thousand, for 516,800 in all.
        var r = PayrollCalculator.Compute(Input(Basic(200_000m, cit: 30_000m), ssf: true), Rates, Schedule);

        r.AnnualTaxableIncome.ShouldBe(2_380_000m);
        r.AnnualTax.ShouldBe(516_800m);
        r.Tds.ShouldBe(43_066.67m);
    }

    [Fact]
    public void Compute_Should_UseEditedSsfRates()
    {
        var r = PayrollCalculator.Compute(Input(Basic(50_000m), ssf: true), new PayrollRates(10m, 10m, 500_000m), Schedule);

        r.EmployeeSsf.ShouldBe(5_000m);
        r.EmployerSsf.ShouldBe(5_000m);
    }

    [Fact]
    public void Compute_Should_ProjectOnlyRemainingMonths_When_JoiningMidYear()
    {
        // Joined in Magh (7th month of the year): 6 months × 50,000 = 300,000, all in the 1% band → 3,000/yr, 500/month.
        // Annualising 12 months instead would give 600,000 → 15,000/yr, 1,250/month.
        var r = PayrollCalculator.Compute(Input(Basic(50_000m), remaining: 6), Rates, Schedule);

        r.ProjectedAnnualIncome.ShouldBe(300_000m);
        r.AnnualTax.ShouldBe(3_000m);
        r.Tds.ShouldBe(500m);
        r.SocialSecurityTax.ShouldBe(500m);
    }

    [Fact]
    public void Compute_Should_ProrateEarnings_In_JoiningMonth()
    {
        var r = PayrollCalculator.Compute(
            Input(new MonthlyPay(30_000m, 2_000m, 4_000m, 1_000m, OtherDeduction: 500m, Cit: 0m), remaining: 12, daysWorked: 15, daysInMonth: 30),
            Rates, Schedule);

        r.Basic.ShouldBe(15_000m);
        r.Grade.ShouldBe(1_000m);
        r.DearnessAllowance.ShouldBe(2_000m);
        r.OtherAllowance.ShouldBe(500m);
        r.Gross.ShouldBe(18_500m);
        r.OtherDeduction.ShouldBe(500m); // deductions are not pro-rated
        // Projection: this half month + 11 full months.
        r.ProjectedAnnualIncome.ShouldBe(18_500m + (11 * 37_000m));
    }

    [Fact]
    public void Compute_Should_AssumeTaxWithheld_For_MonthsBeforePayrollStarted()
    {
        // Employed all year, first run in the 7th month: the 6 missing months are assumed paid and taxed,
        // so the month's tax is still annual / 12.
        var r = PayrollCalculator.Compute(Input(Basic(100_000m), remaining: 6, missing: 6), Rates, Schedule);

        r.AnnualTax.ShouldBe(145_000m);
        r.Tds.ShouldBe(12_083.33m);
    }

    [Fact]
    public void Compute_Should_SpreadRaise_Over_RemainingMonths()
    {
        // 6 recorded months at 100,000 (tax 72,499.98), then 150,000 for 6 months: 1,500,000/yr →
        // 5,000 + 20,000 + 60,000 + 5L @30% 150,000 = 235,000. (235,000 − 72,499.98) / 6 = 27,083.34.
        var prior = new YearToDate(6, 600_000m, 0m, 72_499.98m);
        var r = PayrollCalculator.Compute(Input(Basic(150_000m), remaining: 6, prior: prior), Rates, Schedule);

        r.AnnualTax.ShouldBe(235_000m);
        r.Tds.ShouldBe(27_083.34m);
    }

    [Fact]
    public void Compute_Should_SettleBalance_In_Ashadh()
    {
        // 11 months withheld 10,000 each on 100,000/month; Ashadh settles 145,000 − 110,000.
        var prior = new YearToDate(11, 1_100_000m, 0m, 110_000m);
        var r = PayrollCalculator.Compute(Input(Basic(100_000m), remaining: 1, prior: prior), Rates, Schedule);

        r.Tds.ShouldBe(35_000m);
    }

    [Fact]
    public void Compute_Should_NotRefund_When_AlreadyOverWithheld()
    {
        var prior = new YearToDate(11, 1_100_000m, 0m, 200_000m);
        var r = PayrollCalculator.Compute(Input(Basic(100_000m), remaining: 1, prior: prior), Rates, Schedule);

        r.Tds.ShouldBe(0m);
        r.Net.ShouldBe(100_000m);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(13)]
    public void Compute_Should_Reject_OutOfRangeRemainingMonths(int remaining)
    {
        Should.Throw<ArgumentException>(() => PayrollCalculator.Compute(Input(Basic(1_000m), remaining: remaining), Rates, Schedule));
    }

    [Fact]
    public void Compute_Should_Reject_MoreDaysWorkedThanInMonth()
    {
        Should.Throw<ArgumentException>(() =>
            PayrollCalculator.Compute(Input(Basic(1_000m), daysWorked: 31, daysInMonth: 30), Rates, Schedule));
    }

    [Fact]
    public void Compute_Should_Balance_DebitsAndCredits()
    {
        var r = PayrollCalculator.Compute(Input(new MonthlyPay(45_678.90m, 1_234.56m, 3_210m, 999.99m, 750m, 2_500m), married: true, ssf: true), Rates, Schedule);

        // Dr gross + employer SSF = Cr net + SSF (both) + TDS + CIT + other.
        (r.Gross + r.EmployerSsf).ShouldBe(r.Net + r.EmployeeSsf + r.EmployerSsf + r.Tds + r.Cit + r.OtherDeduction);
    }

    #endregion
}
