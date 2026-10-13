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
    public void Create_Should_Throw_When_TotalAmountNegative()
    {
        Should.Throw<ArgumentOutOfRangeException>(
            () => ConsignmentSettlement.Create(Guid.CreateVersion7(), -1m, 1, DateTime.UtcNow, "manager1"));
    }

    [Fact]
    public void Create_Should_Throw_When_VatAmountNegative()
    {
        Should.Throw<ArgumentOutOfRangeException>(
            () => ConsignmentSettlement.Create(Guid.CreateVersion7(), 100m, 1, DateTime.UtcNow, "manager1", vatAmount: -1m));
    }

    [Fact]
    public void Create_Should_Allow_A_Zero_Total_For_Stock_Consigned_At_No_Cost()
    {
        var settlement = ConsignmentSettlement.Create(Guid.CreateVersion7(), 0m, 1, DateTime.UtcNow, "manager1");

        settlement.TotalAmount.ShouldBe(0m);
        settlement.VatAmount.ShouldBe(0m);
    }

    [Fact]
    public void Create_Should_Keep_The_Vat_Separate_From_The_Net_Total()
    {
        var settlement = ConsignmentSettlement.Create(Guid.CreateVersion7(), 100m, 1, DateTime.UtcNow, "manager1", vatAmount: 13m);

        settlement.TotalAmount.ShouldBe(100m);
        settlement.VatAmount.ShouldBe(13m);
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
