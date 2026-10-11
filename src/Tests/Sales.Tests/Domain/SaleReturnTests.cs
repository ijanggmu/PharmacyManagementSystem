using FSH.Framework.Core.Exceptions;
using FSH.Modules.Sales.Domain;

namespace Sales.Tests.Domain;

public sealed class SaleReturnTests
{
    private static SaleReturn CreateReturnWithItem(decimal quantity = 2m, decimal unitPrice = 10m, decimal unitCost = 6m) =>
        Create(quantity, unitPrice, unitCost, ReturnStatus.Pending);

    private static SaleReturn Create(decimal quantity, decimal unitPrice, decimal unitCost, ReturnStatus status)
    {
        var saleReturn = SaleReturn.Create(Guid.CreateVersion7(), Guid.CreateVersion7(), Guid.CreateVersion7(), DateTime.UtcNow, status, "Damaged", null);
        saleReturn.AddItem(Guid.CreateVersion7(), Guid.CreateVersion7(), quantity, unitPrice, unitCost, "Damaged", PackagingCondition.Sealed);
        return saleReturn;
    }

    #region AddItem / TotalReturnAmount

    [Fact]
    public void AddItem_Should_ComputeTotalReturnAmount_FromSaleUnitPrice()
    {
        var saleReturn = CreateReturnWithItem(quantity: 3m, unitPrice: 10m);

        saleReturn.TotalReturnAmount.ShouldBe(30m);
    }

    [Fact]
    public void AddItem_Should_Throw_When_QuantityNotPositive()
    {
        var saleReturn = SaleReturn.Create(Guid.CreateVersion7(), Guid.CreateVersion7(), null, DateTime.UtcNow, ReturnStatus.Pending, "x", null);

        Should.Throw<CustomException>(() =>
            saleReturn.AddItem(Guid.CreateVersion7(), Guid.CreateVersion7(), 0m, 10m, 5m, "x", PackagingCondition.Opened));
    }

    #endregion

    #region SetStatus — terminal-state guards

    [Fact]
    public void SetStatus_Should_Throw_When_ChangingAwayFromCompleted()
    {
        var saleReturn = CreateReturnWithItem();
        saleReturn.SetStatus(ReturnStatus.Completed);

        Should.Throw<CustomException>(() => saleReturn.SetStatus(ReturnStatus.Pending));
    }

    [Fact]
    public void SetStatus_Should_Throw_When_CompletingARejectedReturn()
    {
        var saleReturn = CreateReturnWithItem();
        saleReturn.SetStatus(ReturnStatus.Rejected);

        Should.Throw<CustomException>(() => saleReturn.SetStatus(ReturnStatus.Completed));
    }

    #endregion

    #region MarkStockRestoredIfNeeded — exactly-once guard

    [Fact]
    public void MarkStockRestoredIfNeeded_Should_ReturnTrue_OnFirstCall_And_False_OnRepeat()
    {
        var saleReturn = CreateReturnWithItem();

        saleReturn.MarkStockRestoredIfNeeded().ShouldBeTrue();
        saleReturn.MarkStockRestoredIfNeeded().ShouldBeFalse();
        saleReturn.StockRestoredAtUtc.ShouldNotBeNull();
    }

    #endregion
}
