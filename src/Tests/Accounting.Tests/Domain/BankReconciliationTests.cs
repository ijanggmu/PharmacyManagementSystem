using FSH.Modules.Accounting.Domain;

namespace Accounting.Tests.Domain;

public sealed class BankReconciliationTests
{
    [Fact]
    public void Create_Should_ComputePositiveVariance_When_StatementExceedsGl()
    {
        var reconciliation = BankReconciliation.Create(DateTime.UtcNow, glBalance: 1000m, statementBalance: 1050m, notes: null, reconciledBy: "manager1");

        reconciliation.Variance.ShouldBe(50m);
    }

    [Fact]
    public void Create_Should_ComputeNegativeVariance_When_StatementBelowGl()
    {
        var reconciliation = BankReconciliation.Create(DateTime.UtcNow, glBalance: 1000m, statementBalance: 900m, notes: null, reconciledBy: "manager1");

        reconciliation.Variance.ShouldBe(-100m);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void Create_Should_Throw_When_ReconciledByIsBlank(string reconciledBy)
    {
        Should.Throw<ArgumentException>(() => BankReconciliation.Create(DateTime.UtcNow, 1000m, 1000m, null, reconciledBy));
    }

    [Fact]
    public void Create_Should_SetBranchId_When_Provided()
    {
        var branchId = Guid.CreateVersion7();
        var reconciliation = BankReconciliation.Create(DateTime.UtcNow, 1000m, 1000m, null, "manager1", branchId);

        reconciliation.BranchId.ShouldBe(branchId);
    }

    [Fact]
    public void Create_Should_LeaveBranchIdNull_When_NotProvided()
    {
        var reconciliation = BankReconciliation.Create(DateTime.UtcNow, 1000m, 1000m, null, "manager1");

        reconciliation.BranchId.ShouldBeNull();
    }
}
