using FSH.Framework.Core.Exceptions;
using FSH.Modules.Purchasing.Domain;

namespace Purchasing.Tests.Domain;

public sealed class PurchaseOrderShortReceiptTests
{
    private static readonly Guid MedicineA = Guid.CreateVersion7();
    private static readonly Guid MedicineB = Guid.CreateVersion7();

    /// <summary>Approved order: A = 10 x 5.00 (VAT 6.50), B = 4 x 20.00 (VAT 0).</summary>
    private static PurchaseOrder ApprovedOrder()
    {
        var order = PurchaseOrder.CreateDraft(Guid.CreateVersion7(), DateTime.UtcNow, "restock");
        order.AddLine(MedicineA, null, null, 10m, 5m, 8m, "R1", vatAmount: 6.5m);
        order.AddLine(MedicineB, null, null, 4m, 20m, null, null);
        order.Approve("manager1");
        return order;
    }

    private static Guid LineOf(PurchaseOrder order, Guid medicineId) => order.Lines.Single(l => l.MedicineId == medicineId).Id;

    [Fact]
    public void ApplyReceivedQuantities_Should_CutLineDown_And_ReturnShortfall_With_SplitVat()
    {
        var order = ApprovedOrder();

        var shortfalls = order.ApplyReceivedQuantities(new Dictionary<Guid, decimal> { [LineOf(order, MedicineA)] = 6m });

        var lineA = order.Lines.Single(l => l.MedicineId == MedicineA);
        lineA.Quantity.ShouldBe(6m);
        lineA.VatAmount.ShouldBe(3.9m);
        var shortfall = shortfalls.Single();
        shortfall.MedicineId.ShouldBe(MedicineA);
        shortfall.Quantity.ShouldBe(4m);
        shortfall.VatAmount.ShouldBe(2.6m);
        shortfall.UnitCostPrice.ShouldBe(5m);
        shortfall.SellingPrice.ShouldBe(8m);
        order.TotalAmount.ShouldBe((6m * 5m) + (4m * 20m));
        order.TotalVatAmount.ShouldBe(3.9m);
    }

    [Fact]
    public void ApplyReceivedQuantities_Should_RemoveLine_When_NothingArrived()
    {
        var order = ApprovedOrder();

        var shortfalls = order.ApplyReceivedQuantities(new Dictionary<Guid, decimal> { [LineOf(order, MedicineB)] = 0m });

        order.Lines.ShouldHaveSingleItem().MedicineId.ShouldBe(MedicineA);
        shortfalls.Single().Quantity.ShouldBe(4m);
    }

    [Fact]
    public void ApplyReceivedQuantities_Should_ReturnNoShortfall_When_FullQuantityArrived()
    {
        var order = ApprovedOrder();

        var shortfalls = order.ApplyReceivedQuantities(new Dictionary<Guid, decimal> { [LineOf(order, MedicineA)] = 10m });

        shortfalls.ShouldBeEmpty();
        order.Lines.Count.ShouldBe(2);
    }

    [Fact]
    public void ApplyReceivedQuantities_Should_Throw_When_MoreThanOrdered()
    {
        var order = ApprovedOrder();

        Should.Throw<CustomException>(
            () => order.ApplyReceivedQuantities(new Dictionary<Guid, decimal> { [LineOf(order, MedicineA)] = 11m }));
    }

    [Fact]
    public void ApplyReceivedQuantities_Should_Throw_When_NothingArrivedAtAll()
    {
        var order = ApprovedOrder();

        var ex = Should.Throw<CustomException>(() => order.ApplyReceivedQuantities(new Dictionary<Guid, decimal>
        {
            [LineOf(order, MedicineA)] = 0m,
            [LineOf(order, MedicineB)] = 0m,
        }));
        ex.Message.ShouldContain("Cancel the purchase order");
    }

    [Fact]
    public void ApplyReceivedQuantities_Should_Throw_When_LineIsNotOnTheOrder()
    {
        var order = ApprovedOrder();

        Should.Throw<CustomException>(
            () => order.ApplyReceivedQuantities(new Dictionary<Guid, decimal> { [Guid.CreateVersion7()] = 1m }));
    }

    [Fact]
    public void ApplyReceivedQuantities_Should_Throw_When_OrderNotApproved()
    {
        var order = PurchaseOrder.CreateDraft(Guid.CreateVersion7(), DateTime.UtcNow, null);
        order.AddLine(MedicineA, null, null, 10m, 5m, null, null);

        Should.Throw<CustomException>(
            () => order.ApplyReceivedQuantities(new Dictionary<Guid, decimal> { [order.Lines[0].Id] = 5m }));
    }

    [Fact]
    public void EnsureReceivable_Should_Ignore_Lines_Dropped_By_A_ShortReceipt()
    {
        var order = ApprovedOrder();
        var lineA = LineOf(order, MedicineA);
        order.ApplyReceivedQuantities(new Dictionary<Guid, decimal> { [LineOf(order, MedicineB)] = 0m });
        order.CaptureReceiptDetails(lineA, "BATCH-1", DateOnly.FromDateTime(DateTime.UtcNow.AddYears(1)), 8m);

        Should.NotThrow(order.EnsureReceivable);
    }

    [Fact]
    public void CreateBackorder_Should_Be_A_Draft_For_The_Same_Supplier_With_The_Balance()
    {
        var order = ApprovedOrder();
        var shortfalls = order.ApplyReceivedQuantities(new Dictionary<Guid, decimal> { [LineOf(order, MedicineA)] = 6m });

        var backorder = PurchaseOrder.CreateBackorder(order, shortfalls, DateTime.UtcNow);

        backorder.Status.ShouldBe(PurchaseOrderStatus.Draft);
        backorder.SupplierId.ShouldBe(order.SupplierId);
        backorder.Narration!.ShouldContain(order.Id.ToString());
        var line = backorder.Lines.ShouldHaveSingleItem();
        line.MedicineId.ShouldBe(MedicineA);
        line.Quantity.ShouldBe(4m);
        line.VatAmount.ShouldBe(2.6m);
        line.BatchNo.ShouldBeNull();
        line.ExpiryDate.ShouldBeNull();
        line.SellingPrice.ShouldBe(8m);
    }

    [Fact]
    public void NoteShortReceipt_Should_Stay_Within_The_Narration_Limit()
    {
        var order = PurchaseOrder.CreateDraft(Guid.CreateVersion7(), DateTime.UtcNow, new string('x', 1020));

        order.NoteShortReceipt(2, Guid.CreateVersion7());

        order.Narration!.Length.ShouldBe(PurchaseOrder.MaxNarrationLength);
    }
}
