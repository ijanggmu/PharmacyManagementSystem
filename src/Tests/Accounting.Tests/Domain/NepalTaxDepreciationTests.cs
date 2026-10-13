using FSH.Modules.Accounting.Domain;

namespace Accounting.Tests.Domain;

/// <summary>Nepal Income Tax Act 2058 Schedule 2 pool depreciation: the acquisition-quarter fractions, carry-forward of the
/// deferred part, disposal proceeds, recapture, terminal deduction and the per-asset pool E.</summary>
public sealed class NepalTaxDepreciationTests
{
    private static TaxAssetFacts New(string pool, decimal cost, int fiscalYear, int month, int? disposedIn = null, decimal proceeds = 0m, int? life = null) =>
        new(pool, cost, new FiscalPeriod(fiscalYear, month), false, fiscalYear, 0m, disposedIn, proceeds, life);

    private static TaxPoolYear Pool(IReadOnlyList<TaxPoolYear> rows, string code) => rows.Single(r => r.Pool.Code == code);

    [Fact]
    public void Defaults_Should_Hold_The_Schedule_2_Rates()
    {
        NepalTaxPoolDefaults.All.Select(p => (p.Code, p.RatePercent))
            .ShouldBe([("A", 5m), ("B", 25m), ("C", 20m), ("D", 15m), ("E", 0m)]);
        NepalTaxPoolDefaults.Find("e")!.PerAssetUsefulLife.ShouldBeTrue();
    }

    [Fact]
    public void Addition_In_The_First_Two_Quarters_Should_Enter_The_Base_In_Full()
    {
        var b = Pool(NepalTaxDepreciation.ForYear([New("B", 100_000m, 2082, 6)], 2082), "B");

        b.AdditionsFull.ShouldBe(100_000m);
        b.DepreciationBase.ShouldBe(100_000m);
        b.Depreciation.ShouldBe(25_000m);
        b.DeferredAdditions.ShouldBe(0m);
        b.ClosingBase.ShouldBe(75_000m);
    }

    [Fact]
    public void Addition_In_Magh_To_Chaitra_Should_Enter_Two_Thirds_And_Carry_The_Rest_Forward()
    {
        var facts = new[] { New("B", 90_000m, 2082, 7) };
        var year1 = Pool(NepalTaxDepreciation.ForYear(facts, 2082), "B");

        year1.AdditionsTwoThirds.ShouldBe(90_000m);
        year1.AdditionsIncluded.ShouldBe(60_000m);
        year1.Depreciation.ShouldBe(15_000m);
        year1.DeferredAdditions.ShouldBe(30_000m);
        year1.ClosingBase.ShouldBe(75_000m); // 60,000 − 15,000 + 30,000

        var year2 = Pool(NepalTaxDepreciation.ForYear(facts, 2083), "B");
        year2.OpeningBase.ShouldBe(75_000m);
        year2.Depreciation.ShouldBe(18_750m);
        year2.ClosingBase.ShouldBe(56_250m);
    }

    [Fact]
    public void Addition_In_Baisakh_To_Ashadh_Should_Enter_One_Third()
    {
        var c = Pool(NepalTaxDepreciation.ForYear([New("C", 90_000m, 2082, 10)], 2082), "C");

        c.AdditionsOneThird.ShouldBe(90_000m);
        c.AdditionsIncluded.ShouldBe(30_000m);
        c.Depreciation.ShouldBe(6_000m); // 20%
        c.DeferredAdditions.ShouldBe(60_000m);
        c.ClosingBase.ShouldBe(84_000m);
    }

    [Fact]
    public void Disposal_Proceeds_Above_The_Base_Should_Be_Recaptured_As_Income()
    {
        // Two vans; one sold for more than the whole pool's base.
        var facts = new[]
        {
            New("C", 100_000m, 2080, 1, disposedIn: 2082, proceeds: 150_000m),
            New("C", 50_000m, 2080, 1),
        };
        var c = Pool(NepalTaxDepreciation.ForYear(facts, 2082), "C");

        // Base going into 2082: 150,000 × 0.8 × 0.8 = 96,000; less 150,000 proceeds = −54,000.
        c.OpeningBase.ShouldBe(96_000m);
        c.DisposalProceeds.ShouldBe(150_000m);
        c.Recapture.ShouldBe(54_000m);
        c.DepreciationBase.ShouldBe(0m);
        c.Depreciation.ShouldBe(0m);
        c.ClosingBase.ShouldBe(0m);
    }

    [Fact]
    public void Pool_With_No_Assets_Left_Should_Deduct_What_Remains()
    {
        var facts = new[] { New("D", 100_000m, 2081, 1, disposedIn: 2082, proceeds: 20_000m) };
        var d = Pool(NepalTaxDepreciation.ForYear(facts, 2082), "D");

        d.OpeningBase.ShouldBe(85_000m);
        d.TerminalDeduction.ShouldBe(65_000m);
        d.Depreciation.ShouldBe(0m);
        d.ClosingBase.ShouldBe(0m);
        d.AssetCount.ShouldBe(0);
    }

    [Fact]
    public void Opening_Asset_Should_Enter_At_Its_Opening_Tax_Value_Not_As_An_Addition()
    {
        var opening = new TaxAssetFacts("B", 80_000m, new FiscalPeriod(2079, 3), true, 2082, 30_000m, null, 0m, null);
        var b = Pool(NepalTaxDepreciation.ForYear([opening], 2082), "B");

        b.OpeningBase.ShouldBe(30_000m);
        b.AdditionsIncluded.ShouldBe(0m);
        b.Depreciation.ShouldBe(7_500m);
    }

    [Fact]
    public void Pool_E_Should_Write_Each_Intangible_Off_Over_Its_Life_Starting_With_The_Quarter_Fraction()
    {
        var software = New("E", 50_000m, 2082, 8, life: 5);
        var e2082 = Pool(NepalTaxDepreciation.ForYear([software], 2082), "E");
        e2082.Depreciation.ShouldBe(6_666.67m); // 10,000 × 2/3
        e2082.ClosingBase.ShouldBe(43_333.33m);

        var e2083 = Pool(NepalTaxDepreciation.ForYear([software], 2083), "E");
        e2083.OpeningBase.ShouldBe(43_333.33m);
        e2083.Depreciation.ShouldBe(10_000m);
    }

    [Fact]
    public void Every_Pool_Should_Be_Reported_Even_When_Empty()
    {
        NepalTaxDepreciation.ForYear([], 2082).Select(r => r.Pool.Code).ShouldBe(["A", "B", "C", "D", "E"]);
    }
}
