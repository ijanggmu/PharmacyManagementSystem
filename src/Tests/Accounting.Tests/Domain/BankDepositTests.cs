using FSH.Modules.Accounting.Domain;

namespace Accounting.Tests.Domain;

public sealed class BankDepositTests
{
    [Fact]
    public void Create_Should_TrimFields_When_Valid()
    {
        var branchId = Guid.CreateVersion7();
        var deposit = BankDeposit.Create(DateTime.UtcNow, 500m, "  till takings  ", "  cashier1  ", branchId);

        deposit.Amount.ShouldBe(500m);
        deposit.Description.ShouldBe("till takings");
        deposit.RecordedBy.ShouldBe("cashier1");
        deposit.Id.ShouldNotBe(Guid.Empty);
        deposit.BranchId.ShouldBe(branchId);
    }

    [Fact]
    public void Create_Should_Throw_When_AmountNotPositive()
    {
        Should.Throw<ArgumentOutOfRangeException>(() => BankDeposit.Create(DateTime.UtcNow, 0m, null, "cashier1", Guid.CreateVersion7()));
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void Create_Should_Throw_When_RecordedByIsBlank(string recordedBy)
    {
        Should.Throw<ArgumentException>(() => BankDeposit.Create(DateTime.UtcNow, 100m, null, recordedBy, Guid.CreateVersion7()));
    }

    [Fact]
    public void Create_Should_Throw_When_BranchIdIsEmpty()
    {
        // BankDeposit is a required-branch entity (docs/branch-scoping-plan.md §2) — Guid.Empty is
        // never a valid substitute for "no branch resolved".
        Should.Throw<ArgumentException>(() => BankDeposit.Create(DateTime.UtcNow, 100m, null, "cashier1", Guid.Empty));
    }
}
