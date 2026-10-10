using FSH.Framework.Core.Exceptions;
using FSH.Modules.Inventory.Domain;

namespace Inventory.Tests.Domain;

public sealed class StockTransferTests
{
    private static StockTransfer CreateTransfer(
        Guid? fromBranchId = null, Guid? toBranchId = null,
        IReadOnlyList<(Guid MedicineId, decimal Quantity)>? lines = null) =>
        StockTransfer.Create(
            fromBranchId ?? Guid.CreateVersion7(),
            toBranchId ?? Guid.CreateVersion7(),
            Guid.CreateVersion7(),
            "test transfer",
            lines ?? [(Guid.CreateVersion7(), 10m)]);

    #region Create

    [Fact]
    public void Create_Should_SetInTransitStatus_And_AddItems()
    {
        var medicineId = Guid.CreateVersion7();
        var transfer = CreateTransfer(lines: [(medicineId, 25m)]);

        transfer.Status.ShouldBe(StockTransferStatus.InTransit);
        transfer.Items.Count.ShouldBe(1);
        transfer.Items[0].MedicineId.ShouldBe(medicineId);
        transfer.Items[0].Quantity.ShouldBe(25m);
        transfer.TransferNumber.ShouldStartWith("TRF-");
    }

    [Fact]
    public void Create_Should_SetFromBranchId_And_ToBranchId()
    {
        var fromBranchId = Guid.CreateVersion7();
        var toBranchId = Guid.CreateVersion7();

        var transfer = CreateTransfer(fromBranchId: fromBranchId, toBranchId: toBranchId);

        transfer.FromBranchId.ShouldBe(fromBranchId);
        transfer.ToBranchId.ShouldBe(toBranchId);
    }

    [Fact]
    public void Create_Should_Throw_When_SourceAndDestinationSame()
    {
        var branchId = Guid.CreateVersion7();

        Should.Throw<CustomException>(() => CreateTransfer(branchId, branchId));
    }

    [Fact]
    public void Create_Should_Throw_When_NoItems()
    {
        Should.Throw<CustomException>(() => CreateTransfer(lines: []));
    }

    [Fact]
    public void Create_Should_Throw_When_ItemQuantityNotPositive()
    {
        Should.Throw<CustomException>(() => CreateTransfer(lines: [(Guid.CreateVersion7(), 0m)]));
    }

    #endregion

    #region MarkReceived

    [Fact]
    public void MarkReceived_Should_CompleteTransfer_When_InTransit()
    {
        var transfer = CreateTransfer();
        var actorId = Guid.CreateVersion7();

        transfer.MarkReceived(actorId);

        transfer.Status.ShouldBe(StockTransferStatus.Completed);
        transfer.ReceivedByUserId.ShouldBe(actorId);
        transfer.ReceivedAtUtc.ShouldNotBeNull();
    }

    [Fact]
    public void MarkReceived_Should_Throw_When_AlreadyCompleted()
    {
        var transfer = CreateTransfer();
        transfer.MarkReceived(Guid.CreateVersion7());

        Should.Throw<CustomException>(() => transfer.MarkReceived(Guid.CreateVersion7()));
    }

    [Fact]
    public void MarkReceived_Should_Throw_When_AlreadyCancelled()
    {
        var transfer = CreateTransfer();
        transfer.Cancel(Guid.CreateVersion7(), "reason");

        Should.Throw<CustomException>(() => transfer.MarkReceived(Guid.CreateVersion7()));
    }

    #endregion

    #region Cancel

    [Fact]
    public void Cancel_Should_SetCancelledStatus_And_Reason_When_InTransit()
    {
        var transfer = CreateTransfer();
        var actorId = Guid.CreateVersion7();

        transfer.Cancel(actorId, "  damaged in transit  ");

        transfer.Status.ShouldBe(StockTransferStatus.Cancelled);
        transfer.CancelledByUserId.ShouldBe(actorId);
        transfer.CancellationReason.ShouldBe("damaged in transit");
    }

    [Fact]
    public void Cancel_Should_Throw_When_AlreadyReceived()
    {
        var transfer = CreateTransfer();
        transfer.MarkReceived(Guid.CreateVersion7());

        Should.Throw<CustomException>(() => transfer.Cancel(Guid.CreateVersion7(), "reason"));
    }

    [Fact]
    public void Cancel_Should_Throw_When_ReasonEmpty()
    {
        var transfer = CreateTransfer();

        Should.Throw<ArgumentException>(() => transfer.Cancel(Guid.CreateVersion7(), string.Empty));
    }

    #endregion
}
