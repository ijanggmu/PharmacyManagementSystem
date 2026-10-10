using FSH.Framework.Core.Exceptions;
using FSH.Modules.Inventory.Domain;

namespace Inventory.Tests.Domain;

public sealed class MedicineBatchTests
{
    private static MedicineBatch CreateBatch(decimal quantity = 100m) =>
        MedicineBatch.Create(Guid.CreateVersion7(), Guid.CreateVersion7(), "B001", DateOnly.FromDateTime(DateTime.UtcNow.AddYears(1)), quantity, 5m, 10m, "A1");

    #region Create

    [Fact]
    public void Create_Should_TrimBatchNo_And_SetInitialQuantity()
    {
        var batch = CreateBatch(50m);

        batch.BatchNo.ShouldBe("B001");
        batch.QuantityOnHand.ShouldBe(50m);
        batch.IsDisposed.ShouldBeFalse();
    }

    [Fact]
    public void Create_Should_SetBranchId()
    {
        var branchId = Guid.CreateVersion7();

        var batch = MedicineBatch.Create(
            Guid.CreateVersion7(), branchId, "B001", DateOnly.FromDateTime(DateTime.UtcNow.AddYears(1)), 10m, 5m, 10m, null);

        batch.BranchId.ShouldBe(branchId);
    }

    [Fact]
    public void Create_Should_Throw_When_QuantityNegative()
    {
        Should.Throw<ArgumentOutOfRangeException>(
            () => MedicineBatch.Create(Guid.CreateVersion7(), Guid.CreateVersion7(), "B001", DateOnly.FromDateTime(DateTime.UtcNow), -1m, 5m, 10m, null));
    }

    #endregion

    #region Deduct

    [Fact]
    public void Deduct_Should_ReduceQuantityOnHand_When_Sufficient()
    {
        var batch = CreateBatch(100m);

        batch.Deduct(30m);

        batch.QuantityOnHand.ShouldBe(70m);
    }

    [Fact]
    public void Deduct_Should_Throw_When_InsufficientStock()
    {
        var batch = CreateBatch(10m);

        Should.Throw<CustomException>(() => batch.Deduct(11m));
    }

    [Fact]
    public void Deduct_Should_Throw_When_BatchDisposed()
    {
        var batch = CreateBatch(10m);
        batch.WriteOff();

        Should.Throw<CustomException>(() => batch.Deduct(1m));
    }

    #endregion

    #region WriteOff

    [Fact]
    public void WriteOff_Should_ZeroQuantity_And_ReturnPreviousRemaining()
    {
        var batch = CreateBatch(15m);

        var written = batch.WriteOff();

        written.ShouldBe(15m);
        batch.QuantityOnHand.ShouldBe(0m);
        batch.IsDisposed.ShouldBeTrue();
    }

    [Fact]
    public void WriteOff_Should_Throw_When_AlreadyDisposed()
    {
        var batch = CreateBatch(10m);
        batch.WriteOff();

        Should.Throw<CustomException>(() => batch.WriteOff());
    }

    #endregion

    #region SetQuantity

    [Fact]
    public void SetQuantity_Should_ReturnDelta()
    {
        var batch = CreateBatch(50m);

        var delta = batch.SetQuantity(30m);

        delta.ShouldBe(-20m);
        batch.QuantityOnHand.ShouldBe(30m);
    }

    #endregion
}
