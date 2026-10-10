using FSH.Framework.Core.Exceptions;
using FSH.Modules.Purchasing.Domain;

namespace Purchasing.Tests.Domain;

public sealed class DirectGoodsReceiptTests
{
    private static readonly Guid BranchId = Guid.CreateVersion7();

    private static DirectGoodsReceipt CreateReceipt() =>
        DirectGoodsReceipt.Create(Guid.CreateVersion7(), DateTime.UtcNow, "INV-001", "clerk1", BranchId);

    #region Create

    [Fact]
    public void Create_Should_StampBranchId_From_CreateArgument()
    {
        var receipt = CreateReceipt();

        receipt.BranchId.ShouldBe(BranchId);
    }

    #endregion

    #region AddLine

    [Fact]
    public void AddLine_Should_Inherit_BranchId_From_Parent_Receipt()
    {
        var receipt = CreateReceipt();

        receipt.AddLine(Guid.CreateVersion7(), 10m, 5m, 1m);

        receipt.Lines.Single().BranchId.ShouldBe(BranchId);
    }

    [Fact]
    public void AddLine_Should_Throw_When_QuantityNotPositive()
    {
        var receipt = CreateReceipt();

        Should.Throw<CustomException>(() => receipt.AddLine(Guid.CreateVersion7(), 0m, 5m, 1m));
    }

    #endregion

    #region Void

    [Fact]
    public void Void_Should_Succeed_When_Received()
    {
        var receipt = CreateReceipt();
        receipt.AddLine(Guid.CreateVersion7(), 10m, 5m, 1m);

        receipt.Void("clerk1", "wrong delivery");

        receipt.Status.ShouldBe(DirectGoodsReceiptStatus.Voided);
    }

    [Fact]
    public void Void_Should_Throw_When_AlreadyVoided()
    {
        var receipt = CreateReceipt();
        receipt.AddLine(Guid.CreateVersion7(), 10m, 5m, 1m);
        receipt.Void("clerk1", "first void");

        Should.Throw<CustomException>(() => receipt.Void("clerk1", "second void"));
    }

    #endregion
}
