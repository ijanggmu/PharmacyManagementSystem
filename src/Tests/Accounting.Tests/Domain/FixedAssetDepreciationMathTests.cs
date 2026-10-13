using FSH.Modules.Accounting.Domain;

namespace Accounting.Tests.Domain;

/// <summary>Book depreciation (straight line, written-down value) and the Nepali fiscal-month arithmetic it runs on.</summary>
public sealed class FixedAssetDepreciationMathTests
{
    private static int P(int fiscalYear, int month) => new FiscalPeriod(fiscalYear, month).Index;

    private static BookDepreciationTerms StraightLine(decimal cost, int lifeMonths, decimal residual = 0m, int start = 0, decimal opening = 0m, int? end = null)
    {
        int acquired = P(2082, 1);
        return new BookDepreciationTerms(cost, residual, FixedAssetDepreciationMethod.StraightLine, lifeMonths, null, acquired,
            start == 0 ? acquired : start, opening, end);
    }

    private static BookDepreciationTerms Wdv(decimal cost, decimal rate, int acquiredMonth = 1, decimal residual = 0m, int? end = null) =>
        new(cost, residual, FixedAssetDepreciationMethod.WrittenDownValue, null, rate, P(2082, acquiredMonth), P(2082, acquiredMonth), 0m, end);

    #region Fiscal periods

    [Fact]
    public void FiscalPeriod_Should_Start_On_1_Shrawan_And_Put_Baisakh_To_Ashadh_In_Months_10_To_12()
    {
        // 1 Shrawan 2082 = 17 Jul 2025; the day before is the last day of Ashadh 2082 (month 12 of FY 2081/82).
        FiscalPeriod.Of(new DateOnly(2025, 7, 17)).ShouldBe(new FiscalPeriod(2082, 1));
        FiscalPeriod.Of(new DateOnly(2025, 7, 16)).ShouldBe(new FiscalPeriod(2081, 12));
        FiscalPeriod.Of(new DateOnly(2026, 4, 14)).ShouldBe(new FiscalPeriod(2082, 10)); // 1 Baisakh 2083

        new FiscalPeriod(2082, 1).Label.ShouldBe("Shrawan 2082");
        new FiscalPeriod(2082, 10).Label.ShouldBe("Baishakh 2083");
        new FiscalPeriod(2082, 1).Days().ShouldBe((new DateOnly(2025, 7, 17), new DateOnly(2025, 8, 16)));
        FiscalPeriod.FromIndex(P(2082, 12)).ShouldBe(new FiscalPeriod(2082, 12));
        (P(2083, 1) - P(2082, 12)).ShouldBe(1);
    }

    [Fact]
    public void FiscalPeriod_OfUtc_Should_Use_The_Nepal_Day()
    {
        // 18:30 UTC on 16 Jul 2025 is 00:15 NPT on 17 Jul — already 1 Shrawan.
        FiscalPeriod.OfUtc(new DateTime(2025, 7, 16, 18, 30, 0, DateTimeKind.Utc)).ShouldBe(new FiscalPeriod(2082, 1));
    }

    [Theory]
    [InlineData(1, 3)]
    [InlineData(6, 3)]  // Poush
    [InlineData(7, 2)]  // Magh
    [InlineData(9, 2)]  // Chaitra
    [InlineData(10, 1)] // Baisakh
    [InlineData(12, 1)] // Ashadh
    public void TaxAdditionThirds_Should_Follow_The_Quarter_Acquired(int month, int thirds) =>
        new FiscalPeriod(2082, month).TaxAdditionThirds.ShouldBe(thirds);

    #endregion

    #region Straight line

    [Fact]
    public void StraightLine_Should_Spread_Cost_Evenly_And_Total_Exactly()
    {
        var schedule = BookDepreciation.Schedule(StraightLine(120_000m, 60), P(2090, 12));

        schedule.Count.ShouldBe(60);
        schedule.ShouldAllBe(m => m.Amount == 2_000m);
        schedule.Sum(m => m.Amount).ShouldBe(120_000m);
        schedule[0].Period.ShouldBe(P(2082, 1)); // the acquisition month is charged in full
    }

    [Fact]
    public void StraightLine_Should_Absorb_Rounding_So_The_Months_Add_Up_To_The_Depreciable_Amount()
    {
        var schedule = BookDepreciation.Schedule(StraightLine(100_000m, 3), P(2083, 12));

        schedule.Select(m => m.Amount).ShouldBe([33_333.33m, 33_333.34m, 33_333.33m]);
        schedule.Sum(m => m.Amount).ShouldBe(100_000m);
    }

    [Fact]
    public void StraightLine_Should_Stop_At_The_Residual_Value()
    {
        var schedule = BookDepreciation.Schedule(StraightLine(50_000m, 12, residual: 2_000m), P(2084, 12));

        schedule.Sum(m => m.Amount).ShouldBe(48_000m);
        schedule.Count.ShouldBe(12);
    }

    [Fact]
    public void StraightLine_Opening_Asset_Should_Spread_The_Rest_Over_The_Remaining_Life()
    {
        // Acquired Shrawan 2082, 24-month life; taken over in Shrawan 2083 with 12 months (12,000) already depreciated.
        var terms = StraightLine(24_000m, 24, start: P(2083, 1), opening: 12_000m);
        var schedule = BookDepreciation.Schedule(terms, P(2090, 12));

        schedule.Count.ShouldBe(12);
        schedule[0].Period.ShouldBe(P(2083, 1));
        schedule.Sum(m => m.Amount).ShouldBe(12_000m);
        schedule.ShouldAllBe(m => m.Amount == 1_000m);
    }

    [Fact]
    public void Schedule_Should_Charge_Nothing_For_The_Disposal_Month_Or_After()
    {
        var schedule = BookDepreciation.Schedule(StraightLine(12_000m, 12, end: P(2082, 4)), P(2083, 12));

        schedule.Select(m => m.Period).ShouldBe([P(2082, 1), P(2082, 2), P(2082, 3)]);
        BookDepreciation.AmountFor(StraightLine(12_000m, 12, end: P(2082, 4)), P(2082, 4)).ShouldBe(0m);
    }

    #endregion

    #region Written-down value

    [Fact]
    public void Wdv_Should_Charge_Rate_On_The_Year_Opening_Book_Value_Spread_Over_Its_Months()
    {
        var schedule = BookDepreciation.Schedule(Wdv(100_000m, 25m), P(2083, 12));

        // Year 1: 100,000 × 25% ÷ 12 = 2,083.33 a month.
        schedule.Where(m => m.Period <= P(2082, 12)).ShouldAllBe(m => m.Amount == 2_083.33m);
        decimal year1 = schedule.Where(m => m.Period <= P(2082, 12)).Sum(m => m.Amount);
        year1.ShouldBe(24_999.96m);

        // Year 2 rebases on the Shrawan book value: (100,000 − 24,999.96) × 25% ÷ 12 = 1,562.50.
        schedule.Where(m => m.Period >= P(2083, 1)).ShouldAllBe(m => m.Amount == 1_562.50m);
    }

    [Fact]
    public void Wdv_Acquired_Mid_Year_Should_Charge_From_The_Acquisition_Month_Then_Rebase_In_Shrawan()
    {
        var schedule = BookDepreciation.Schedule(Wdv(60_000m, 20m, acquiredMonth: 7), P(2083, 1));

        schedule.Count.ShouldBe(7); // Magh–Ashadh (6) + Shrawan
        schedule.Take(6).ShouldAllBe(m => m.Amount == 1_000m);
        schedule[6].Amount.ShouldBe(Math.Round((60_000m - 6_000m) * 0.20m / 12m, 2)); // 900
    }

    [Fact]
    public void Wdv_Should_Never_Take_Book_Value_Below_The_Residual()
    {
        var schedule = BookDepreciation.Schedule(Wdv(10_000m, 100m, residual: 9_000m), P(2084, 12));

        schedule.Sum(m => m.Amount).ShouldBe(1_000m);
        schedule[^1].Amount.ShouldBeLessThanOrEqualTo(833.33m);
    }

    #endregion
}
