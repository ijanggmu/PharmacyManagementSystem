using FSH.Framework.Core.Exceptions;
using FSH.Modules.Sales.Domain;

namespace Sales.Tests.Domain;

public sealed class SaleTests
{
    private static Sale CreateSaleWithItem(Guid? customerId = null, decimal quantity = 2m, decimal unitPrice = 10m)
    {
        var sale = Sale.StartBuilding(Guid.CreateVersion7(), customerId, null, null);
        sale.AddItem(Guid.CreateVersion7(), quantity, unitPrice, 0m, 0m, 5m);
        return sale;
    }

    #region AddItem

    [Fact]
    public void AddItem_Should_ComputeTotalAmount()
    {
        var sale = CreateSaleWithItem(quantity: 2m, unitPrice: 10m);

        sale.TotalAmount.ShouldBe(20m);
    }

    [Fact]
    public void AddItem_Should_Throw_When_NotBuilding()
    {
        var sale = CreateSaleWithItem();
        sale.Finalize("Cash", sale.TotalAmount);

        Should.Throw<CustomException>(() => sale.AddItem(Guid.CreateVersion7(), 1m, 5m, 0m, 0m, 2m));
    }

    #endregion

    #region Finalize — full payment (walk-in)

    [Fact]
    public void Finalize_Should_Succeed_When_PaidInFull()
    {
        var sale = CreateSaleWithItem();

        sale.Finalize("Cash", sale.TotalAmount);

        sale.Status.ShouldBe(SaleStatus.Completed);
        sale.BalanceDue.ShouldBe(0m);
    }

    [Fact]
    public void Finalize_Should_Throw_When_NoItems()
    {
        var sale = Sale.StartBuilding(Guid.CreateVersion7(), null, null, null);

        Should.Throw<CustomException>(() => sale.Finalize("Cash", 0m));
    }

    [Fact]
    public void Finalize_Should_Throw_When_PaymentExceedsTotal()
    {
        var sale = CreateSaleWithItem();

        Should.Throw<CustomException>(() => sale.Finalize("Cash", sale.TotalAmount + 1m));
    }

    #endregion

    #region Finalize — credit sale (on account)

    [Fact]
    public void Finalize_Should_Succeed_When_PartialPayment_And_CustomerSet()
    {
        var customerId = Guid.CreateVersion7();
        var sale = CreateSaleWithItem(customerId, quantity: 2m, unitPrice: 10m);

        sale.Finalize("Cash", 5m);

        sale.Status.ShouldBe(SaleStatus.Completed);
        sale.BalanceDue.ShouldBe(15m);
    }

    [Fact]
    public void Finalize_Should_Throw_When_PartialPayment_And_NoCustomer()
    {
        var sale = CreateSaleWithItem(customerId: null, quantity: 2m, unitPrice: 10m);

        Should.Throw<CustomException>(() => sale.Finalize("Cash", 5m));
    }

    #endregion

    #region Cancel

    [Fact]
    public void Cancel_Should_Succeed_When_Completed()
    {
        var sale = CreateSaleWithItem();
        sale.Finalize("Cash", sale.TotalAmount);

        sale.Cancel("customer return");

        sale.Status.ShouldBe(SaleStatus.Cancelled);
        sale.CancelReason.ShouldBe("customer return");
    }

    [Fact]
    public void Cancel_Should_Throw_When_StillBuilding()
    {
        var sale = CreateSaleWithItem();

        Should.Throw<CustomException>(() => sale.Cancel("mistake"));
    }

    #endregion

    #region IRD sync

    [Fact]
    public void AssignInvoiceNumberIfMissing_Should_Set_InvoiceNumber_When_None_Set()
    {
        var sale = CreateSaleWithItem();

        sale.AssignInvoiceNumberIfMissing("INV-260915-1234");

        sale.InvoiceNumber.ShouldBe("INV-260915-1234");
    }

    [Fact]
    public void AssignInvoiceNumberIfMissing_Should_Be_NoOp_When_Already_Set()
    {
        var sale = CreateSaleWithItem();
        sale.AssignInvoiceNumberIfMissing("INV-260915-1234");

        sale.AssignInvoiceNumberIfMissing("INV-260915-9999");

        sale.InvoiceNumber.ShouldBe("INV-260915-1234");
    }

    [Fact]
    public void Sale_Should_Default_IrdStatus_To_Pending()
    {
        var sale = CreateSaleWithItem();

        sale.IrdStatus.ShouldBe(IrdSyncStatus.Pending);
    }

    [Fact]
    public void MarkIrdSynced_Should_Set_Status_Synced_And_SyncedAt()
    {
        var sale = CreateSaleWithItem();
        sale.AssignInvoiceNumberIfMissing("INV-260915-1234");

        sale.MarkIrdSynced("EXT-999");

        sale.IrdStatus.ShouldBe(IrdSyncStatus.Synced);
        sale.IrdInvoiceId.ShouldBe("EXT-999");
        sale.IrdSyncedAtUtc.ShouldNotBeNull();
        sale.IrdError.ShouldBeNull();
    }

    [Fact]
    public void MarkIrdSynced_Should_Fall_Back_To_InvoiceNumber_When_No_ExternalId()
    {
        var sale = CreateSaleWithItem();
        sale.AssignInvoiceNumberIfMissing("INV-260915-1234");

        sale.MarkIrdSynced(null);

        sale.IrdInvoiceId.ShouldBe("INV-260915-1234");
    }

    [Fact]
    public void MarkIrdDispatchFailed_Should_Stay_Pending_When_Not_Final()
    {
        var sale = CreateSaleWithItem();

        sale.MarkIrdDispatchFailed("network timeout", isFinalAttempt: false);

        sale.IrdStatus.ShouldBe(IrdSyncStatus.Pending);
        sale.IrdError.ShouldBe("network timeout");
    }

    [Fact]
    public void MarkIrdDispatchFailed_Should_Move_To_Failed_When_Final()
    {
        var sale = CreateSaleWithItem();

        sale.MarkIrdDispatchFailed("permanently broken", isFinalAttempt: true);

        sale.IrdStatus.ShouldBe(IrdSyncStatus.Failed);
        sale.IrdError.ShouldBe("permanently broken");
    }

    #endregion

    #region IRD lock (mirrors prevent_locked_sales_modification)

    private static Sale CreateIrdSyncedSale()
    {
        var sale = CreateSaleWithItem(customerId: Guid.CreateVersion7());
        sale.Finalize("Cash", sale.TotalAmount);
        sale.AssignInvoiceNumberIfMissing("INV-260915-1234");
        sale.MarkIrdSynced("EXT-1");
        return sale;
    }

    [Fact]
    public void Sale_Should_Not_Be_IrdLocked_When_Pending()
    {
        var sale = CreateSaleWithItem();

        sale.IsIrdLocked.ShouldBeFalse();
    }

    [Fact]
    public void Sale_Should_Be_IrdLocked_When_Synced()
    {
        var sale = CreateIrdSyncedSale();

        sale.IsIrdLocked.ShouldBeTrue();
    }

    [Fact]
    public void Cancel_Should_Throw_SaleLockedException_When_IrdSynced()
    {
        var sale = CreateIrdSyncedSale();

        var ex = Should.Throw<SaleLockedException>(() => sale.Cancel("customer return"));

        ex.StatusCode.ShouldBe(System.Net.HttpStatusCode.Conflict);
        sale.Status.ShouldBe(SaleStatus.Completed);
        sale.CancelReason.ShouldBeNull();
    }

    [Fact]
    public void AddItem_Should_Throw_SaleLockedException_When_IrdSynced()
    {
        var sale = CreateIrdSyncedSale();
        var itemCount = sale.Items.Count;

        Should.Throw<SaleLockedException>(() => sale.AddItem(Guid.CreateVersion7(), 1m, 5m, 0m, 0m, 2m));
        sale.Items.Count.ShouldBe(itemCount);
    }

    [Fact]
    public void Finalize_Should_Throw_SaleLockedException_When_IrdSynced()
    {
        var sale = CreateIrdSyncedSale();

        Should.Throw<SaleLockedException>(() => sale.Finalize("Card", sale.TotalAmount));
    }

    [Fact]
    public void AssignInvoiceNumberIfMissing_Should_Throw_SaleLockedException_When_IrdSynced()
    {
        var sale = CreateIrdSyncedSale();

        Should.Throw<SaleLockedException>(() => sale.AssignInvoiceNumberIfMissing("INV-260915-9999"));
        sale.InvoiceNumber.ShouldBe("INV-260915-1234");
    }

    [Fact]
    public void MarkIrdSynced_Should_Throw_SaleLockedException_When_AlreadySynced()
    {
        var sale = CreateIrdSyncedSale();

        Should.Throw<SaleLockedException>(() => sale.MarkIrdSynced("EXT-2"));
        sale.IrdInvoiceId.ShouldBe("EXT-1");
    }

    [Fact]
    public void MarkIrdDispatchFailed_Should_Throw_SaleLockedException_When_IrdSynced()
    {
        var sale = CreateIrdSyncedSale();

        Should.Throw<SaleLockedException>(() => sale.MarkIrdDispatchFailed("late error", isFinalAttempt: true));
        sale.IrdStatus.ShouldBe(IrdSyncStatus.Synced);
        sale.IrdError.ShouldBeNull();
    }

    [Fact]
    public void Cancel_Should_Still_Succeed_When_IrdFailed_NotLocked()
    {
        var sale = CreateSaleWithItem();
        sale.Finalize("Cash", sale.TotalAmount);
        sale.MarkIrdDispatchFailed("permanent failure", isFinalAttempt: true);

        sale.Cancel("customer return");

        sale.Status.ShouldBe(SaleStatus.Cancelled);
    }

    #endregion
}
