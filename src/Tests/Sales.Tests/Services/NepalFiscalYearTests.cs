using System.Globalization;
using FSH.Modules.Sales.Contracts.Fiscal;
using FSH.Modules.Sales.Services;

namespace Sales.Tests.Services;

public sealed class NepalFiscalYearTests
{
    [Theory]
    // 1 Shrawan 2083 = 2026-07-17. Midnight in Nepal (UTC+05:45) is 18:15 UTC the day before.
    [InlineData("2026-07-16T18:14:59Z", 2082)]
    [InlineData("2026-07-16T18:15:00Z", 2083)]
    [InlineData("2026-10-09T06:00:00Z", 2083)]
    [InlineData("2027-07-16T18:14:00Z", 2083)]
    [InlineData("2027-07-16T18:16:00Z", 2084)]
    [InlineData("2014-01-01T00:00:00Z", 2070)]
    public void StartYearFor_Should_Switch_On_1_Shrawan_Nepal_Time(string utc, int expected)
    {
        var instant = DateTime.Parse(utc, CultureInfo.InvariantCulture,
            DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal);

        NepalFiscalYear.StartYearFor(instant).ShouldBe(expected);
    }

    [Fact]
    public void StartYearFor_Should_Throw_Outside_The_Calendar_Table() =>
        Should.Throw<InvalidOperationException>(
            () => NepalFiscalYear.StartYearFor(new DateTime(2040, 1, 1, 0, 0, 0, DateTimeKind.Utc)));

    [Theory]
    [InlineData(2083, "2083/84")]
    [InlineData(2099, "2099/00")]
    public void Label_Should_Match_The_Web_App(int year, string expected) =>
        NepalFiscalYear.Label(year).ShouldBe(expected);

    [Fact]
    public void Format_Should_Zero_Pad_The_Sequence() =>
        InvoiceNumberService.Format(new InvoiceNumberContext("INV", "MAIN"), 2083, 42).ShouldBe("INV-MAIN-2083/84-00042");
}
