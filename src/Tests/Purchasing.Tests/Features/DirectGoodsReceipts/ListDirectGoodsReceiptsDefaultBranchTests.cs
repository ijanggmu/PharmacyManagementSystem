using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Purchasing.Contracts.v1.DirectGoodsReceipts;
using FSH.Modules.Purchasing.Data;
using FSH.Modules.Purchasing.Domain;
using FSH.Modules.Purchasing.Features.v1.DirectGoodsReceipts.ListDirectGoodsReceipts;
using NSubstitute;
using Purchasing.Tests.Features;

namespace Purchasing.Tests.Features.DirectGoodsReceipts;

/// <summary>
/// Branch-REQUIRED DirectGoodsReceipt: an omitted <c>branchId</c> defaults to
/// <c>ICurrentBranch.ResolveListBranchFilterAsync</c>; an explicit one wins; a null current branch leaves the list unfiltered.
/// </summary>
public sealed class ListDirectGoodsReceiptsDefaultBranchTests : IDisposable
{
    private readonly PurchasingDbContext _db = PurchasingDbContextFactory.Create();
    private readonly ICurrentBranch _currentBranch = Substitute.For<ICurrentBranch>();
    private readonly Guid _currentBranchId = Guid.CreateVersion7();
    private readonly Guid _otherBranchId = Guid.CreateVersion7();

    public void Dispose() => _db.Dispose();

    #region Happy Path

    [Fact]
    public async Task Handle_Should_DefaultToCurrentBranch_When_BranchIdOmitted()
    {
        // Arrange
        _currentBranch.ResolveListBranchFilterAsync(Arg.Any<Guid?>(), Arg.Any<CancellationToken>()).Returns(ci => ci.ArgAt<Guid?>(0) ?? _currentBranchId);
        await SeedAsync();
        var sut = new ListDirectGoodsReceiptsQueryHandler(_db, _currentBranch, NamesMediator.Create());

        // Act
        var result = await sut.Handle(new ListDirectGoodsReceiptsQuery(), CancellationToken.None);

        // Assert
        result.ShouldHaveSingleItem().BranchId.ShouldBe(_currentBranchId);
    }

    [Fact]
    public async Task Handle_Should_HonourExplicitBranchId_Over_CurrentBranch()
    {
        // Arrange
        _currentBranch.ResolveListBranchFilterAsync(Arg.Any<Guid?>(), Arg.Any<CancellationToken>()).Returns(ci => ci.ArgAt<Guid?>(0) ?? _currentBranchId);
        await SeedAsync();
        var sut = new ListDirectGoodsReceiptsQueryHandler(_db, _currentBranch, NamesMediator.Create());

        // Act
        var result = await sut.Handle(new ListDirectGoodsReceiptsQuery(_otherBranchId), CancellationToken.None);

        // Assert
        result.ShouldHaveSingleItem().BranchId.ShouldBe(_otherBranchId);
    }

    #endregion

    #region Edge Cases

    [Fact]
    public async Task Handle_Should_ReturnAllBranches_When_CallerHoldsViewAll()
    {
        // Arrange (ViewAll caller: list filter is null even though the caller's own branch resolves)
        _currentBranch.GetBranchIdAsync(Arg.Any<CancellationToken>()).Returns(_currentBranchId);
        _currentBranch.ResolveListBranchFilterAsync(Arg.Any<Guid?>(), Arg.Any<CancellationToken>()).Returns(ci => ci.ArgAt<Guid?>(0));
        await SeedAsync();
        var sut = new ListDirectGoodsReceiptsQueryHandler(_db, _currentBranch, NamesMediator.Create());

        // Act
        var result = await sut.Handle(new ListDirectGoodsReceiptsQuery(), CancellationToken.None);

        // Assert
        result.Count.ShouldBe(2);
    }

    [Fact]
    public async Task Handle_Should_NotFilter_When_CurrentBranchIsNull()
    {
        // Arrange
        _currentBranch.ResolveListBranchFilterAsync(Arg.Any<Guid?>(), Arg.Any<CancellationToken>()).Returns(ci => ci.ArgAt<Guid?>(0));
        await SeedAsync();
        var sut = new ListDirectGoodsReceiptsQueryHandler(_db, _currentBranch, NamesMediator.Create());

        // Act
        var result = await sut.Handle(new ListDirectGoodsReceiptsQuery(), CancellationToken.None);

        // Assert
        result.Count.ShouldBe(2);
    }

    #endregion

    private async Task SeedAsync()
    {
        var receiptCurrent = DirectGoodsReceipt.Create(Guid.CreateVersion7(), DateTime.UtcNow, "C-1", "clerk1", _currentBranchId);
        receiptCurrent.AddLine(Guid.CreateVersion7(), 5m, 2m, 0m);
        var receiptOther = DirectGoodsReceipt.Create(Guid.CreateVersion7(), DateTime.UtcNow, "O-1", "clerk2", _otherBranchId);
        receiptOther.AddLine(Guid.CreateVersion7(), 5m, 2m, 0m);

        _db.DirectGoodsReceipts.AddRange(receiptCurrent, receiptOther);
        await _db.SaveChangesAsync(CancellationToken.None);
    }
}
