using FSH.Modules.Payroll.Contracts.Dtos;
using FSH.Modules.Payroll.Domain;

namespace Payroll.Tests.Domain;

public sealed class PayrollRunAndMonthTests
{
    private static readonly DateTime Now = new(2025, 8, 20, 6, 0, 0, DateTimeKind.Utc);

    private static PayrollRun DraftWithOneLine()
    {
        var month = NepaliMonth.Of(2082, 4);
        var run = PayrollRun.CreateDraft(Guid.CreateVersion7(), month, "preparer", Now);
        var employee = Employee.Create(
            new EmployeeDetails("Sita Sharma", run.BranchId, "Pharmacist", new DateOnly(2024, 1, 1), "123456789", null, false,
                null, null, PayrollMaritalStatus.SinglePerson, null), Now);
        var result = PayrollCalculator.Compute(
            new PayrollLineInput(new MonthlyPay(30_000m, 0m, 0m, 0m, 0m, 0m), month.Days, month.Days, false, false, 12, 0, YearToDate.None),
            new PayrollRates(11m, 20m, 500_000m), NepalPayrollDefaults.ScheduleFor(2082));
        run.ReplaceLines([PayrollRunLine.Create(run.Id, employee, month.Days, month.Days, result)], Now);
        return run;
    }

    #region Lifecycle

    [Fact]
    public void Run_Should_Move_Draft_Approved_Posted_Paid()
    {
        var run = DraftWithOneLine();
        run.Status.ShouldBe(PayrollRunStatuses.Draft);
        run.TotalGross.ShouldBe(30_000m);

        run.Approve("approver", Now);
        run.Status.ShouldBe(PayrollRunStatuses.Approved);
        run.ApprovedBy.ShouldBe("approver");

        run.Post(run.PeriodEnd, "poster", Now);
        run.Status.ShouldBe(PayrollRunStatuses.Posted);
        run.PostingDate.ShouldBe(run.PeriodEnd);

        run.MarkPaid(" bank ", run.PeriodEnd, "payer", Now);
        run.Status.ShouldBe(PayrollRunStatuses.Paid);
        run.PaymentMethod.ShouldBe("bank");
    }

    [Fact]
    public void Run_Should_RefuseSkippingSteps()
    {
        var run = DraftWithOneLine();

        Should.Throw<InvalidOperationException>(() => run.Post(run.PeriodEnd, null, Now));
        Should.Throw<InvalidOperationException>(() => run.MarkPaid("cash", run.PeriodEnd, null, Now));

        run.Approve(null, Now);
        Should.Throw<InvalidOperationException>(() => run.Approve(null, Now));
        Should.Throw<InvalidOperationException>(() => run.ReplaceLines([], Now));
    }

    [Fact]
    public void Approve_Should_Refuse_EmptyRun()
    {
        var run = PayrollRun.CreateDraft(Guid.CreateVersion7(), NepaliMonth.Of(2082, 4), null, Now);

        Should.Throw<InvalidOperationException>(() => run.Approve(null, Now));
    }

    [Theory]
    [InlineData(PayrollRunStatuses.Draft, false)]
    [InlineData(PayrollRunStatuses.Approved, true)]
    [InlineData(PayrollRunStatuses.Posted, true)]
    [InlineData(PayrollRunStatuses.Paid, true)]
    public void IsRecorded_Should_CountApprovedAndLater(string status, bool expected) =>
        PayrollRun.IsRecorded(status).ShouldBe(expected);

    #endregion

    #region Nepali month

    [Fact]
    public void Shrawan_Should_StartTheFiscalYear()
    {
        var month = NepaliMonth.Of(2082, 4);

        month.FiscalYearStart.ShouldBe(2082);
        month.MonthOfFiscalYear.ShouldBe(1);
        month.RemainingMonthsInFiscalYear.ShouldBe(12);
        month.Start.ShouldBe(new DateOnly(2025, 7, 17)); // 1 Shrawan 2082
        month.Label.ShouldBe("Shrawan 2082");
        month.FiscalYearLabel.ShouldBe("2082/83");
        month.Days.ShouldBeInRange(29, 32);
    }

    [Fact]
    public void Ashadh_Should_EndTheFiscalYear()
    {
        var month = NepaliMonth.Of(2083, 3);

        month.FiscalYearStart.ShouldBe(2082);
        month.MonthOfFiscalYear.ShouldBe(12);
        month.RemainingMonthsInFiscalYear.ShouldBe(1);
        month.End.AddDays(1).ShouldBe(NepaliMonth.Of(2083, 4).Start);
    }

    [Fact]
    public void Months_Should_BeContiguous()
    {
        var magh = NepaliMonth.Of(2082, 10);
        var falgun = NepaliMonth.Of(2082, 11);

        magh.MonthOfFiscalYear.ShouldBe(7);
        magh.End.AddDays(1).ShouldBe(falgun.Start);
    }

    [Theory]
    [InlineData(2082, 0)]
    [InlineData(2082, 13)]
    [InlineData(1990, 4)]
    public void Unsupported_Months_Should_BeRejected(int year, int month)
    {
        NepaliMonth.IsSupported(year, month).ShouldBeFalse();
        Should.Throw<ArgumentOutOfRangeException>(() => NepaliMonth.Of(year, month));
    }

    #endregion

    [Fact]
    public void SalaryStructure_Should_RejectNegativeAmounts()
    {
        Should.Throw<ArgumentException>(() =>
            SalaryStructure.Create(Guid.NewGuid(), new DateOnly(2025, 7, 17), -1m, 0m, 0m, 0m, 0m, 0m, null, Now));
    }

    [Fact]
    public void Settings_Should_DefaultToStatutoryRates_And_ValidateEdits()
    {
        var settings = PayrollSettings.CreateDefault();
        settings.EmployeeSsfRatePercent.ShouldBe(11m);
        settings.EmployerSsfRatePercent.ShouldBe(20m);
        settings.RetirementDeductionCap.ShouldBe(500_000m);

        Should.Throw<ArgumentException>(() => settings.Update(101m, 20m, 0m, Now));
        settings.Update(10m, 20m, 300_000m, Now);
        settings.ToRates().ShouldBe(new PayrollRates(10m, 20m, 300_000m));
    }

    [Fact]
    public void Employee_Should_RejectUnknownMaritalStatus()
    {
        Should.Throw<ArgumentException>(() => Employee.Create(
            new EmployeeDetails("X", Guid.NewGuid(), null, new DateOnly(2025, 1, 1), null, null, false, null, null, "Divorced", null), Now));
    }
}
