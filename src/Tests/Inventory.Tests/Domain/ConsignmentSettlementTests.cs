using FSH.Modules.Inventory.Domain;

namespace Inventory.Tests.Domain;

public sealed class ConsignmentSettlementTests
{
    [Fact]
    public void Create_Should_TrimSettledBy_When_Valid()
    {
        var settlement = ConsignmentSettlement.Create(Guid.CreateVersion7(), 250m, 3, DateTime.UtcNow, "  manager1  ");

        settlement.TotalAmount.ShouldBe(250m);
        settlement.PositionsSettledCount.ShouldBe(3);
        settlement.SettledBy.ShouldBe("manager1");
    }

    [Fact]
    public void Create_Should_Throw_When_TotalAmountNotPositive()
    {
        Should.Throw<ArgumentOutOfRangeException>(
            () => ConsignmentSettlement.Create(Guid.CreateVersion7(), 0m, 1, DateTime.UtcNow, "manager1"));
    }

    [Fact]
    public void Create_Should_PersistNullBranchId_When_NotProvided()
    {
        var settlement = ConsignmentSettlement.Create(Guid.CreateVersion7(), 250m, 3, DateTime.UtcNow, "manager1");

        settlement.BranchId.ShouldBeNull();
    }

    [Fact]
    public void Create_Should_PersistBranchId_When_Provided()
    {
        var branchId = Guid.CreateVersion7();
        var settlement = ConsignmentSettlement.Create(Guid.CreateVersion7(), 250m, 3, DateTime.UtcNow, "manager1", branchId);

        settlement.BranchId.ShouldBe(branchId);
    }
}
