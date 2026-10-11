using FSH.Framework.Core.Exceptions;
using FSH.Modules.Sales.Domain;

namespace Sales.Tests.Domain;

/// <summary>Paisa-exact tender matching, line reversal valuation and the refund settlement rule.</summary>
public sealed class SaleMoneyRulesTests
{
    private static Sale Sale(Guid? customerId = null, decimal quantity = 3m, decimal unitPrice = 10m, decimal discount = 0m)
    {
        var sale = FSH.Modules.Sales.Domain.Sale.StartBuilding(Guid.CreateVersion7(), customerId, null, null);
        sale.AddItem(Guid.CreateVersion7(), quantity, unitPrice, discount, 0m, 5m);
        return sale;
    }

    [Theory]
    [InlineData(29.99)]
    [InlineData(30.01)]
    public void Finalize_Should_Refuse_A_One_Paisa_Mismatch(double paid)
    {
        var sale = Sale();

        Should.Throw<CustomException>(() => sale.Finalize([new SaleTender("cash", (decimal)paid, null)], shortfallIsOnAccount: false));
    }

    [Fact]
    public void Finalize_Should_Round_Legs_To_The_Paisa_And_Accept_An_Exact_Match()
    {
        var sale = Sale();

        sale.Finalize([new SaleTender("cash", 15.004m, null), new SaleTender("card", 14.996m, null)], shortfallIsOnAccount: false);

        sale.Payments.Sum(p => p.Amount).ShouldBe(30m);
        sale.BalanceDue.ShouldBe(0m);
    }

    [Fact]
    public void Legacy_Shortfall_Of_A_Customer_Sale_Should_Go_On_Account_Exactly()
    {
        var sale = Sale(Guid.CreateVersion7());

        sale.Finalize("cash", 29.99m);

        sale.BalanceDue.ShouldBe(0.01m);
    }

    [Fact]
    public void Reversal_Amounts_Should_Add_Up_To_The_Line_Total()
    {
        // 3 x 10 - 1 discount = 29: thirds are 9.67, 9.67 and the last 9.66.
        var sale = Sale(quantity: 3m, unitPrice: 10m, discount: 1m);
        var line = sale.Items[0];

        decimal first = line.ReversalAmount(1m, 0m, 0m);
        decimal second = line.ReversalAmount(1m, 1m, first);
        decimal third = line.ReversalAmount(1m, 2m, first + second);

        first.ShouldBe(9.67m);
        second.ShouldBe(9.67m);
        third.ShouldBe(9.66m);
        (first + second + third).ShouldBe(29m);
        line.EffectiveUnitPrice.ShouldBe(9.67m);
    }

    [Fact]
    public void Settle_Should_Cancel_The_Unpaid_Balance_Before_Paying_Out()
    {
        var sale = Sale(Guid.CreateVersion7(), quantity: 2m, unitPrice: 100m);
        sale.Finalize([new SaleTender("cash", 50m, null), new SaleTender("credit", 150m, null)], shortfallIsOnAccount: false);

        var first = RefundMethods.Settle(sale, 120m, "cash", onAccountAlreadyCredited: 0m);
        var second = RefundMethods.Settle(sale, 80m, "cash", onAccountAlreadyCredited: first.OnAccount);

        first.ShouldBe(new SaleReversalSettlement(0m, 0m, 120m));
        second.ShouldBe(new SaleReversalSettlement(50m, 0m, 30m));
    }

    [Theory]
    [InlineData("cash", 100, 0, 0)]
    [InlineData("card", 0, 100, 0)]
    [InlineData("bank", 0, 100, 0)]
    [InlineData("store_credit", 0, 0, 100)]
    [InlineData("original_payment", 25, 75, 0)]
    [InlineData(null, 25, 75, 0)]
    public void Settle_Should_Follow_The_Refund_Method(string? method, int cash, int bank, int onAccount)
    {
        var sale = Sale(Guid.CreateVersion7(), quantity: 2m, unitPrice: 100m);
        sale.Finalize([new SaleTender("cash", 50m, null), new SaleTender("esewa", 150m, null)], shortfallIsOnAccount: false);

        var settlement = RefundMethods.Settle(sale, 100m, method, onAccountAlreadyCredited: 0m);

        settlement.ShouldBe(new SaleReversalSettlement(cash, bank, onAccount));
        settlement.Total.ShouldBe(100m);
    }

    [Fact]
    public void Rejected_Refund_Should_Be_Terminal()
    {
        var refund = SaleRefund.Create(
            Guid.CreateVersion7(), Guid.CreateVersion7(), null, DateTime.UtcNow, RefundStatus.Rejected, "x", "partial_refund", "cash", 0m, 0m, null);

        Should.Throw<CustomException>(() => refund.SetStatus(RefundStatus.Approved));
    }

    [Fact]
    public void Vat_Breakdown_Should_Carve_Vat_From_Taxable_Amounts_Only()
    {
        var breakdown = VatBreakdown.Compute(13m, [(113m, true), (50m, false)]);

        breakdown.ShouldNotBeNull();
        breakdown.VatAmount.ShouldBe(13m);
        breakdown.TaxableAmount.ShouldBe(100m);
        breakdown.ExemptAmount.ShouldBe(50m);
        VatBreakdown.Compute(null, [(113m, true)]).ShouldBeNull();
    }
}
