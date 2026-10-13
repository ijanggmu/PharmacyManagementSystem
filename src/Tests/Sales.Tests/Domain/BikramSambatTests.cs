using FSH.Modules.Sales.Contracts.Fiscal;

namespace Sales.Tests.Domain;

public sealed class BikramSambatTests
{
    [Theory]
    [InlineData(2026, 4, 14, "2083.01.01")]   // 1 Baisakh 2083
    [InlineData(2026, 7, 17, "2083.04.01")]   // 1 Shrawan 2083 — fiscal year 2083/84 starts
    [InlineData(2026, 7, 16, "2083.03.32")]   // last day of Asar 2083 (32 days)
    [InlineData(2026, 10, 13, "2083.06.27")]
    [InlineData(2027, 4, 13, "2083.12.30")]   // last day of 2083
    [InlineData(2027, 4, 14, "2084.01.01")]
    [InlineData(2024, 2, 29, "2080.11.17")]   // AD leap day
    public void FromAd_Should_Convert_To_Bs(int y, int m, int d, string expected) =>
        BikramSambat.FromAd(new DateOnly(y, m, d)).ToIrdString().ShouldBe(expected);

    [Fact]
    public void FormatUtc_Should_Use_The_Nepal_Day()
    {
        // 18:30 UTC on 16 Jul 2026 is 00:15 NPT on 17 Jul — already 1 Shrawan in Nepal.
        BikramSambat.FormatUtc(new DateTime(2026, 7, 16, 18, 30, 0, DateTimeKind.Utc)).ShouldBe("2083.04.01");
        BikramSambat.FormatUtc(new DateTime(2026, 7, 16, 18, 0, 0, DateTimeKind.Utc)).ShouldBe("2083.03.32");
    }

    [Fact]
    public void Shrawan_First_Should_Agree_With_The_Fiscal_Year_Table()
    {
        for (int year = NepalFiscalYear.FirstStartYear; year <= NepalFiscalYear.LastStartYear; year++)
        {
            var (start, _) = NepalFiscalYear.Range(year);
            BikramSambat.FromAd(start).ShouldBe(new BsDate(year, 4, 1));
        }
    }

    [Fact]
    public void FromAd_Should_Throw_Outside_The_Table() =>
        Should.Throw<ArgumentOutOfRangeException>(() => BikramSambat.FromAd(new DateOnly(2040, 1, 1)));
}
