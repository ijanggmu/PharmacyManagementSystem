using Accounting.Tests.Features;
using FSH.Modules.Accounting.Contracts.v1.Banking;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using FSH.Modules.Accounting.Features.v1.Banking.SearchBankDeposits;
using FSH.Modules.Multitenancy.Contracts;
using NSubstitute;

namespace Accounting.Tests.Features.Banking;

/// <summary>
/// Branch-REQUIRED BankDeposit: an omitted <c>branchId</c> defaults via <c>ICurrentBranch.ResolveListBranchFilterAsync</c>,
/// an explicit one wins, and a null current branch leaves the search unfiltered. Nullable-branch ledgers
/// (vouchers, expenses, bank reconciliation) intentionally keep no default.
/// </summary>
public sealed class SearchBankDepositsDefaultBranchTests : IDisposable
{
    private readonly AccountingDbContext _db = AccountingDbContextFactory.Create();
    private readonly ICurrentBranch _currentBranch = Substitute.For<ICurrentBranch>();
    private readonly Guid _currentBranchId = Guid.CreateVersion7();
    private readonly Guid _otherBranchId = Guid.CreateVersion7();

    public void Dispose() => _db.Dispose();

    #region Happy Path

    [Fact]
    public async Task SearchBankDeposits_Should_DefaultToCurrentBranch_When_BranchIdOmitted()
    {
        // Arrange
        _currentBranch.ResolveListBranchFilterAsync(Arg.Any<Guid?>(), Arg.Any<CancellationToken>()).Returns(ci => ci.ArgAt<Guid?>(0) ?? _currentBranchId);
        await SeedAsync();
        var sut = new SearchBankDepositsQueryHandler(_db, _currentBranch);

        // Act
        var result = await sut.Handle(new SearchBankDepositsQuery(), CancellationToken.None);

        // Assert
        result.TotalCount.ShouldBe(1);
        result.Items.ShouldHaveSingleItem().BranchId.ShouldBe(_currentBranchId);
    }

    [Fact]
    public async Task SearchBankDeposits_Should_HonourExplicitBranchId_Over_CurrentBranch()
    {
        // Arrange
        _currentBranch.ResolveListBranchFilterAsync(Arg.Any<Guid?>(), Arg.Any<CancellationToken>()).Returns(ci => ci.ArgAt<Guid?>(0) ?? _currentBranchId);
        await SeedAsync();
        var sut = new SearchBankDepositsQueryHandler(_db, _currentBranch);

        // Act
        var result = await sut.Handle(new SearchBankDepositsQuery(BranchId: _otherBranchId), CancellationToken.None);

        // Assert
        result.Items.ShouldHaveSingleItem().BranchId.ShouldBe(_otherBranchId);
    }

    #endregion

    #region Edge Cases

    [Fact]
    public async Task SearchBankDeposits_Should_ReturnAllBranches_When_CallerHoldsViewAll()
    {
        // Arrange (ViewAll caller: list filter is null even though the caller's own branch resolves)
        _currentBranch.GetBranchIdAsync(Arg.Any<CancellationToken>()).Returns(_currentBranchId);
        _currentBranch.ResolveListBranchFilterAsync(Arg.Any<Guid?>(), Arg.Any<CancellationToken>()).Returns(ci => ci.ArgAt<Guid?>(0));
        await SeedAsync();
        var sut = new SearchBankDepositsQueryHandler(_db, _currentBranch);

        // Act
        var result = await sut.Handle(new SearchBankDepositsQuery(), CancellationToken.None);

        // Assert
        result.TotalCount.ShouldBe(2);
    }

    [Fact]
    public async Task SearchBankDeposits_Should_NotFilter_When_CurrentBranchIsNull()
    {
        // Arrange
        _currentBranch.ResolveListBranchFilterAsync(Arg.Any<Guid?>(), Arg.Any<CancellationToken>()).Returns(ci => ci.ArgAt<Guid?>(0));
        await SeedAsync();
        var sut = new SearchBankDepositsQueryHandler(_db, _currentBranch);

        // Act
        var result = await sut.Handle(new SearchBankDepositsQuery(), CancellationToken.None);

        // Assert
        result.TotalCount.ShouldBe(2);
    }

    #endregion

    private async Task SeedAsync()
    {
        _db.BankDeposits.Add(BankDeposit.Create(DateTime.UtcNow, 100m, null, "cashier", _currentBranchId));
        _db.BankDeposits.Add(BankDeposit.Create(DateTime.UtcNow, 200m, null, "cashier", _otherBranchId));
        await _db.SaveChangesAsync(CancellationToken.None);
    }
}
