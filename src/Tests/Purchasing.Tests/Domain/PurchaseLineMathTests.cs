using FSH.Framework.Core.Exceptions;
using FSH.Modules.Purchasing.Domain;

namespace Purchasing.Tests.Domain;

public sealed class PurchaseLineMathTests
{
    private static readonly Guid MedicineA = Guid.CreateVersion7();
    private static readonly Guid MedicineB = Guid.CreateVersion7();
    private static readonly Guid MedicineC = Guid.CreateVersion7();

    [Theory]
    [InlineData(1000, 10, 0, 100)]
    [InlineData(1000, 10, 25, 25)] // a positive amount wins over the percent
    [InlineData(333.33, 7.5, 0, 25)] // 24.99975 rounds half away from zero to 25.00
    [InlineData(1000, 0, 0, 0)]
    public void LineDiscount_Should_UseAmount_Else_PercentOfGross(decimal gross, decimal percent, decimal amount, decimal expected)
    {
        PurchaseLineMath.LineDiscount(gross, percent, amount).ShouldBe(expected);
    }

    [Fact]
    public void Gross_Should_Use_PackRate_When_EnteredInPacks()
    {
        // 3 boxes of 3 at Rs 100 a box: 9 units, exactly Rs 300 even though the unit rate is 33.33.
        PurchaseLineMath.Gross(9m, 33.33m, 3m, 100m).ShouldBe(300m);
        PurchaseLineMath.Gross(9m, 33.33m, null, null).ShouldBe(299.97m);
    }

    [Fact]
    public void Allocate_Should_SpreadInProportion_And_AddBackExactly()
    {
        var shares = PurchaseLineMath.Allocate([600m, 300m, 100m], 50m);

        shares.ShouldBe([30m, 15m, 5m]);
    }

    [Fact]
    public void Allocate_Should_GiveLeftoverPaisaToLargestRemainders()
    {
        // 10.00 over three equal lines: 3.33 each, the leftover paisa to the first (ties go to the earlier line).
        var shares = PurchaseLineMath.Allocate([100m, 100m, 100m], 10m);

        shares.ShouldBe([3.34m, 3.33m, 3.33m]);
        shares.Sum().ShouldBe(10m);
    }

    [Fact]
    public void Allocate_Should_NeverGoNegative_OnTinyDiscounts()
    {
        var shares = PurchaseLineMath.Allocate([1m, 1m, 1m, 1m, 1m, 1m], 0.03m);

        shares.ShouldAllBe(s => s >= 0m);
        shares.Sum().ShouldBe(0.03m);
    }

    [Fact]
    public void Allocate_Should_SkipLinesWithNoValue()
    {
        var shares = PurchaseLineMath.Allocate([0m, 200m], 20m);

        shares.ShouldBe([0m, 20m]);
    }

    [Fact]
    public void EffectiveUnitCost_Should_SpreadNetOverPaidAndFreeUnits()
    {
        // 10 + 1 at Rs 100: 1000 / 11 = 90.909 -> 90.91.
        PurchaseLineMath.EffectiveUnitCost(1000m, 10m, 1m).ShouldBe(90.91m);
        PurchaseLineMath.EffectiveUnitCost(0m, 0m, 0m).ShouldBe(0m);
    }

    [Fact]
    public void DirectReceipt_Should_ComputeNet_Vat_And_EffectiveCost_With_Scheme_And_Discounts()
    {
        // A: 10 + 1 free at 100, 10% trade discount -> 1000 - 100 = 900.
        // B: 5 at 20 -> 100.
        // Bill (cash) discount 50 spread 900:100 -> 45 / 5. A taxable 855, B taxable 95.
        var receipt = DirectGoodsReceipt.Create(Guid.CreateVersion7(), DateTime.UtcNow, "INV-1", "tester", Guid.CreateVersion7());
        receipt.AddLine(MedicineA, 10m, 100m, 111.15m, new PurchaseLineTerms(FreeQuantity: 1m, DiscountPercent: 10m));
        receipt.AddLine(MedicineB, 5m, 20m, 0m);
        receipt.ApplyBillDiscount(0m, 50m);

        var a = receipt.Lines[0];
        a.GrossAmount.ShouldBe(1000m);
        a.DiscountAmount.ShouldBe(100m);
        a.BillDiscountAmount.ShouldBe(45m);
        a.NetAmount.ShouldBe(855m);
        a.ReceivedQuantity.ShouldBe(11m);
        a.EffectiveUnitCost.ShouldBe(77.73m); // 855 / 11 = 77.727
        receipt.Lines[1].NetAmount.ShouldBe(95m);

        receipt.SubtotalAmount.ShouldBe(1100m);
        receipt.LineDiscountAmount.ShouldBe(100m);
        receipt.BillDiscountAmount.ShouldBe(50m);
        receipt.NetAmount.ShouldBe(950m);
        receipt.VatAmount.ShouldBe(111.15m);
        receipt.GrossAmount.ShouldBe(1061.15m);
    }

    [Fact]
    public void ApplyBillDiscount_Should_UsePercentOfDiscountedTotal_When_NoAmount()
    {
        var receipt = DirectGoodsReceipt.Create(Guid.CreateVersion7(), DateTime.UtcNow, null, "tester", Guid.CreateVersion7());
        receipt.AddLine(MedicineA, 10m, 100m, 0m, new PurchaseLineTerms(DiscountAmount: 100m));
        receipt.AddLine(MedicineB, 3m, 33.33m, 0m);
        receipt.ApplyBillDiscount(2m, 0m);

        // (900 + 99.99) * 2% = 19.9998 -> 20.00
        receipt.BillDiscountAmount.ShouldBe(20m);
        receipt.Lines.Sum(l => l.BillDiscountAmount).ShouldBe(20m);
        receipt.BillDiscountPercent.ShouldBe(2m);
    }

    [Fact]
    public void ApplyBillDiscount_Should_Reject_MoreThanTheBill()
    {
        var receipt = DirectGoodsReceipt.Create(Guid.CreateVersion7(), DateTime.UtcNow, null, "tester", Guid.CreateVersion7());
        receipt.AddLine(MedicineA, 1m, 100m, 0m);

        Should.Throw<CustomException>(() => receipt.ApplyBillDiscount(0m, 100.01m));
    }

    [Fact]
    public void AddLine_Should_Reject_DiscountAboveGross_And_NegativeFree()
    {
        var receipt = DirectGoodsReceipt.Create(Guid.CreateVersion7(), DateTime.UtcNow, null, "tester", Guid.CreateVersion7());

        Should.Throw<CustomException>(() => receipt.AddLine(MedicineA, 1m, 100m, 0m, new PurchaseLineTerms(DiscountAmount: 101m)));
        Should.Throw<CustomException>(() => receipt.AddLine(MedicineA, 1m, 100m, 0m, new PurchaseLineTerms(FreeQuantity: -1m)));
        Should.Throw<CustomException>(() => receipt.AddLine(MedicineA, 1m, 100m, 0m, new PurchaseLineTerms(DiscountPercent: 101m)));
    }

    [Fact]
    public void PurchaseOrder_ShortReceipt_Should_SplitFreeGoods_Discounts_And_BillShare()
    {
        var order = PurchaseOrder.CreateDraft(Guid.CreateVersion7(), DateTime.UtcNow, null);
        // A: 10 + 2 free at 50 (gross 500), 10% off -> 450. C: 4 at 25 -> 100.
        order.AddLine(MedicineA, "B1", new DateOnly(2030, 1, 1), 10m, 50m, 80m, null, 45m,
            new PurchaseLineTerms(FreeQuantity: 2m, DiscountPercent: 10m));
        order.AddLine(MedicineC, "C1", new DateOnly(2030, 1, 1), 4m, 25m, 40m, null, 0m);
        order.ApplyBillDiscount(0m, 55m); // 450:100 -> 45 / 10
        order.TotalAmount.ShouldBe(495m);
        order.Approve("manager");
        var lineA = order.Lines.Single(l => l.MedicineId == MedicineA);

        var shortfalls = order.ApplyReceivedQuantities(new Dictionary<Guid, decimal> { [lineA.Id] = 5m });

        // Half the paid units arrived: half the free goods (1), discount, bill share and VAT.
        lineA.Quantity.ShouldBe(5m);
        lineA.FreeQuantity.ShouldBe(1m);
        lineA.DiscountAmount.ShouldBe(25m);
        lineA.BillDiscountAmount.ShouldBe(22.5m);
        lineA.VatAmount.ShouldBe(22.5m);
        lineA.NetAmount.ShouldBe(202.5m); // 250 - 25 - 22.5
        lineA.EffectiveUnitCost.ShouldBe(33.75m); // 202.5 / 6
        order.BillDiscountAmount.ShouldBe(32.5m); // 22.5 + C's 10

        var shortfall = shortfalls.Single();
        shortfall.Quantity.ShouldBe(5m);
        shortfall.Terms!.FreeQuantity.ShouldBe(1m);
        shortfall.Terms.DiscountAmount.ShouldBe(25m);
        shortfall.BillDiscountAmount.ShouldBe(22.5m);

        var backorder = PurchaseOrder.CreateBackorder(order, shortfalls, DateTime.UtcNow);
        var backLine = backorder.Lines.ShouldHaveSingleItem();
        backLine.FreeQuantity.ShouldBe(1m);
        backLine.DiscountAmount.ShouldBe(25m);
        backorder.BillDiscountAmount.ShouldBe(22.5m);
        backLine.NetAmount.ShouldBe(202.5m);
    }

    [Fact]
    public void PurchaseOrder_ShortFreeGoodsOnly_Should_KeepPaidQuantity()
    {
        var order = PurchaseOrder.CreateDraft(Guid.CreateVersion7(), DateTime.UtcNow, null);
        order.AddLine(MedicineA, "B1", new DateOnly(2030, 1, 1), 10m, 10m, 15m, null, 0m, new PurchaseLineTerms(FreeQuantity: 1m));
        order.Approve("manager");
        var line = order.Lines.Single();

        var shortfalls = order.ApplyReceivedQuantities(
            new Dictionary<Guid, decimal>(), new Dictionary<Guid, decimal> { [line.Id] = 0m });

        line.Quantity.ShouldBe(10m);
        line.FreeQuantity.ShouldBe(0m);
        line.EffectiveUnitCost.ShouldBe(10m);
        shortfalls.Single().Quantity.ShouldBe(0m);
    }
}
