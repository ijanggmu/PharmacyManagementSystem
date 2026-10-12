using FSH.Framework.Core.Exceptions;
using FSH.Modules.Sales.Domain;

namespace Sales.Tests.Domain;

public sealed class SaleRefundTests
{
    private static SaleRefund CreateRefundWithItem(decimal quantity = 2m, decimal unitPrice = 10m, decimal tax = 0m, decimal fee = 0m)
    {
        var refund = SaleRefund.Create(Guid.CreateVersion7(), 
            Guid.CreateVersion7(), Guid.CreateVersion7(), DateTime.UtcNow, RefundStatus.Pending,
            "Not satisfied", "partial_refund", "original_payment", fee, null);
        refund.AddItem(Guid.CreateVersion7(), Guid.CreateVersion7(), quantity, unitPrice);
        SetLegacyTax(refund, tax);
        return refund;
    }

    /// <summary>Older refunds stored an extra tax amount; new ones can't, so tests covering those rows set it directly.</summary>
    private static void SetLegacyTax(SaleRefund refund, decimal tax) =>
        typeof(SaleRefund).GetField("<TaxRefundAmount>k__BackingField", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance)!
            .SetValue(refund, tax);


    #region AddItem / NetRefundAmount

    [Fact]
    public void NetRefundAmount_Should_Equal_ItemsTotal_Minus_Fee()
    {
        var refund = CreateRefundWithItem(quantity: 2m, unitPrice: 10m, fee: 3m);

        refund.TaxRefundAmount.ShouldBe(0m);
        refund.NetRefundAmount.ShouldBe(17m); // 20 - 3: prices include VAT, nothing is added for tax
    }

    [Fact]
    public void NetRefundAmount_Should_Still_Include_The_Tax_Stored_On_An_Older_Refund()
    {
        var refund = CreateRefundWithItem(quantity: 2m, unitPrice: 10m, tax: 5m, fee: 3m);

        refund.RefundAmount.ShouldBe(20m);
        refund.NetRefundAmount.ShouldBe(22m); // 20 + 5 - 3
    }

    [Fact]
    public void NetRefundAmount_Should_FloorAtZero_When_FeeExceedsItemsAndTax()
    {
        var refund = CreateRefundWithItem(quantity: 1m, unitPrice: 5m, tax: 0m, fee: 100m);

        refund.NetRefundAmount.ShouldBe(0m);
    }

    [Fact]
    public void AddItem_Should_Throw_When_QuantityNotPositive()
    {
        var refund = SaleRefund.Create(Guid.CreateVersion7(), 
            Guid.CreateVersion7(), null, DateTime.UtcNow, RefundStatus.Pending, "x", "partial_refund", "original_payment", 0m, null);

        Should.Throw<CustomException>(() => refund.AddItem(Guid.CreateVersion7(), Guid.CreateVersion7(), 0m, 10m));
    }

    #endregion

    #region SetStatus — terminal-state guards

    [Fact]
    public void SetStatus_Should_Throw_When_ChangingAwayFromCompleted()
    {
        var refund = CreateRefundWithItem();
        refund.SetStatus(RefundStatus.Completed);

        Should.Throw<CustomException>(() => refund.SetStatus(RefundStatus.Pending));
    }

    #endregion

    #region MarkAccountingPostedIfNeeded — exactly-once guard

    [Fact]
    public void MarkAccountingPostedIfNeeded_Should_ReturnTrue_OnFirstCall_And_False_OnRepeat()
    {
        var refund = CreateRefundWithItem();

        refund.MarkAccountingPostedIfNeeded().ShouldBeTrue();
        refund.MarkAccountingPostedIfNeeded().ShouldBeFalse();
        refund.AccountingPostedAtUtc.ShouldNotBeNull();
    }

    #endregion
}
