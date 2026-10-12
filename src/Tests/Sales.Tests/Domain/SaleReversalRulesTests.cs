using FSH.Modules.Sales.Domain;

namespace Sales.Tests.Domain;

public sealed class SaleReversalRulesTests
{
    private static Sale CreditSale()
    {
        var sale = Sale.StartBuilding(Guid.CreateVersion7(), Guid.CreateVersion7(), null, null);
        sale.AddItem(Guid.CreateVersion7(), 2m, 100m, 0m, 0m, 50m);
        sale.Finalize([new SaleTender("cash", 50m, null), new SaleTender("credit", 150m, null)], shortfallIsOnAccount: false);
        return sale;
    }

    [Theory]
    [InlineData(null, 150, 50)]  // customer balance unknown: the sale's own balance caps it
    [InlineData(500, 150, 50)]   // customer owes more than this sale: the sale caps it
    [InlineData(40, 40, 160)]    // customer has paid most of it off: only 40 still open
    [InlineData(0, 0, 200)]      // fully paid since: nothing goes to the account
    [InlineData(-25, 0, 200)]    // customer in credit: nothing goes to the account
    public void Settle_Should_Cap_On_Account_At_The_Still_Open_Balance(int? customerBalance, int onAccount, int cash)
    {
        var settlement = RefundMethods.Settle(CreditSale(), 200m, "cash", 0m, (decimal?)customerBalance);

        settlement.OnAccount.ShouldBe((decimal)onAccount);
        settlement.Cash.ShouldBe((decimal)cash);
        settlement.Total.ShouldBe(200m);
    }

    [Fact]
    public void Vat_Breakdown_Should_Fall_Back_To_The_Tenant_Rate_For_Legacy_Sales()
    {
        VatBreakdown.Compute(null, [(113m, true), (20m, false)]).ShouldBeNull();

        var breakdown = VatBreakdown.Compute(null, [(113m, true), (20m, false)], fallbackRatePercent: 13m).ShouldNotBeNull();
        breakdown.VatAmount.ShouldBe(13m);
        breakdown.TaxableAmount.ShouldBe(100m);
        breakdown.ExemptAmount.ShouldBe(20m);

        // A stored rate always wins.
        VatBreakdown.Compute(0m, [(113m, true)], fallbackRatePercent: 13m)!.VatAmount.ShouldBe(0m);
    }
}
