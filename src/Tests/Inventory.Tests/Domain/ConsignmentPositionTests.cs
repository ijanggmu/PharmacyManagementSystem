using FSH.Modules.Inventory.Domain;

namespace Inventory.Tests.Domain;

public sealed class ConsignmentPositionTests
{
    private static ConsignmentPosition CreatePosition(decimal quantityReceived = 100m) =>
        ConsignmentPosition.Create(Guid.CreateVersion7(), Guid.CreateVersion7(), Guid.CreateVersion7(), "C001", quantityReceived, 5m, DateTime.UtcNow);

    [Fact]
    public void Create_Should_SeedZeroSettledQuantity()
    {
        var position = CreatePosition(100m);

        position.QuantityReceived.ShouldBe(100m);
        position.SettledQuantity.ShouldBe(0m);
    }

    [Fact]
    public void Create_Should_PersistNullBranchId_When_NotProvided()
    {
        var position = CreatePosition();

        position.BranchId.ShouldBeNull();
    }

    [Fact]
    public void Create_Should_PersistBranchId_When_Provided()
    {
        var branchId = Guid.CreateVersion7();
        var position = ConsignmentPosition.Create(
            Guid.CreateVersion7(), Guid.CreateVersion7(), Guid.CreateVersion7(), "C001", 100m, 5m, DateTime.UtcNow, branchId);

        position.BranchId.ShouldBe(branchId);
    }

    [Fact]
    public void Create_Should_Throw_When_QuantityReceivedNotPositive()
    {
        Should.Throw<ArgumentOutOfRangeException>(
            () => ConsignmentPosition.Create(Guid.CreateVersion7(), Guid.CreateVersion7(), Guid.CreateVersion7(), "C001", 0m, 5m, DateTime.UtcNow));
    }

    [Fact]
    public void MarkSettled_Should_AccumulateSettledQuantity()
    {
        var position = CreatePosition(100m);

        position.MarkSettled(30m);
        position.MarkSettled(20m);

        position.SettledQuantity.ShouldBe(50m);
    }

    [Fact]
    public void MarkSettled_Should_Throw_When_QuantityNotPositive()
    {
        var position = CreatePosition(100m);

        Should.Throw<ArgumentOutOfRangeException>(() => position.MarkSettled(0m));
    }
}
