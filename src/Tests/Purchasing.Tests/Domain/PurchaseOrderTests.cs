using FSH.Framework.Core.Exceptions;
using FSH.Modules.Purchasing.Domain;

namespace Purchasing.Tests.Domain;

public sealed class PurchaseOrderTests
{
    private static PurchaseOrder CreateOrderWithLine(decimal quantity = 10m, decimal unitCost = 5m)
    {
        var order = PurchaseOrder.CreateDraft(Guid.CreateVersion7(), DateTime.UtcNow, "test order");
        order.AddLine(Guid.CreateVersion7(), "B001", DateOnly.FromDateTime(DateTime.UtcNow.AddYears(1)), quantity, unitCost, unitCost * 2, "A1");
        return order;
    }

    #region AddLine

    [Fact]
    public void AddLine_Should_ComputeTotalAmount()
    {
        var order = CreateOrderWithLine(quantity: 10m, unitCost: 5m);

        order.TotalAmount.ShouldBe(50m);
    }

    [Fact]
    public void AddLine_Should_Throw_When_QuantityNotPositive()
    {
        var order = PurchaseOrder.CreateDraft(Guid.CreateVersion7(), DateTime.UtcNow, null);

        Should.Throw<CustomException>(
            () => order.AddLine(Guid.CreateVersion7(), "B001", DateOnly.FromDateTime(DateTime.UtcNow), 0m, 5m, 10m, null));
    }

    [Fact]
    public void AddLine_Should_Throw_When_NotDraft()
    {
        var order = CreateOrderWithLine();
        order.Approve("manager1");

        Should.Throw<CustomException>(
            () => order.AddLine(Guid.CreateVersion7(), "B002", DateOnly.FromDateTime(DateTime.UtcNow), 1m, 5m, 10m, null));
    }

    #endregion

    #region Approve

    [Fact]
    public void Approve_Should_Succeed_When_DraftWithLines()
    {
        var order = CreateOrderWithLine();

        order.Approve("manager1");

        order.Status.ShouldBe(PurchaseOrderStatus.Approved);
        order.ApprovedBy.ShouldBe("manager1");
    }

    [Fact]
    public void Approve_Should_Throw_When_NoLines()
    {
        var order = PurchaseOrder.CreateDraft(Guid.CreateVersion7(), DateTime.UtcNow, null);

        Should.Throw<CustomException>(() => order.Approve("manager1"));
    }

    #endregion

    #region Receive

    [Fact]
    public void Receive_Should_Succeed_When_Approved()
    {
        var order = CreateOrderWithLine();
        order.Approve("manager1");

        order.Receive("clerk1");

        order.Status.ShouldBe(PurchaseOrderStatus.Received);
        order.ReceivedBy.ShouldBe("clerk1");
    }

    [Fact]
    public void Receive_Should_Throw_When_StillDraft()
    {
        var order = CreateOrderWithLine();

        Should.Throw<CustomException>(() => order.Receive("clerk1"));
    }

    #endregion

    #region Cancel

    [Fact]
    public void Cancel_Should_Succeed_When_Draft()
    {
        var order = CreateOrderWithLine();

        order.Cancel("no longer needed");

        order.Status.ShouldBe(PurchaseOrderStatus.Cancelled);
        order.CancelReason.ShouldBe("no longer needed");
    }

    [Fact]
    public void Cancel_Should_Throw_When_AlreadyReceived()
    {
        var order = CreateOrderWithLine();
        order.Approve("manager1");
        order.Receive("clerk1");

        Should.Throw<CustomException>(() => order.Cancel("too late"));
    }

    #endregion
}
