using FSH.Modules.Sales.Features.v1.Reports.GetMedicineMargins;

namespace Sales.Tests.Features.Reports;

public sealed class MedicineMarginCalculatorTests
{
    private static MedicineMarginLine Line(
        Guid medicineId, decimal qty, decimal lineTotal, decimal unitCost, bool taxable = true, decimal? vat = 13m, decimal? rate = 13m) =>
        new(medicineId, qty, lineTotal, unitCost, taxable, vat, rate);

    [Fact]
    public void NetOfVat_Carves_Vat_Only_Out_Of_Taxable_Lines_Of_Vat_Sales()
    {
        var id = Guid.NewGuid();

        MedicineMarginCalculator.NetOfVat(Line(id, 1m, 113m, 0m)).ShouldBe(100m);
        MedicineMarginCalculator.NetOfVat(Line(id, 1m, 113m, 0m, taxable: false)).ShouldBe(113m);
        MedicineMarginCalculator.NetOfVat(Line(id, 1m, 113m, 0m, vat: null, rate: null)).ShouldBe(113m);
        // A VAT sale that did not store its rate falls back to 13%.
        MedicineMarginCalculator.NetOfVat(Line(id, 1m, 113m, 0m, rate: null)).ShouldBe(100m);
    }

    [Fact]
    public void Top_Groups_By_Medicine_And_Ranks_By_Margin()
    {
        Guid a = Guid.NewGuid(), b = Guid.NewGuid(), c = Guid.NewGuid();
        var lines = new[]
        {
            Line(a, 2m, 226m, 60m),                   // net 200, cost 120
            Line(a, 1m, 113m, 60m),                   // net 100, cost 60  → a: margin 120
            Line(b, 10m, 500m, 20m, taxable: false),  // net 500, cost 200 → b: margin 300
            Line(c, 1m, 50m, 70m, taxable: false),    // a loss            → c: margin -20
        };

        var top = MedicineMarginCalculator.Top(lines, 2);

        top.Count.ShouldBe(2);
        top[0].MedicineId.ShouldBe(b);
        top[0].Margin.ShouldBe(300m);
        top[0].MarginPercent.ShouldBe(60.0m);
        top[1].MedicineId.ShouldBe(a);
        top[1].Quantity.ShouldBe(3m);
        top[1].NetRevenue.ShouldBe(300m);
        top[1].Cost.ShouldBe(180m);
        top[1].Margin.ShouldBe(120m);
        top[1].MarginPercent.ShouldBe(40.0m);
    }

    [Fact]
    public void Top_Handles_Empty_Input_Zero_Revenue_And_Non_Positive_Take()
    {
        var free = Guid.NewGuid();

        MedicineMarginCalculator.Top([], 5).ShouldBeEmpty();
        MedicineMarginCalculator.Top([Line(free, 1m, 0m, 5m)], 0).ShouldBeEmpty();
        MedicineMarginCalculator.Top([Line(free, 1m, 0m, 5m)], 5).ShouldHaveSingleItem().MarginPercent.ShouldBeNull();
    }
}
