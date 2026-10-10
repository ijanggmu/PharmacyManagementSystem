using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Sales.Contracts.v1.CashShifts;
using FSH.Modules.Sales.Data;
using FSH.Modules.Sales.Contracts.v1.Sales;
using FSH.Modules.Sales.Domain;
using FSH.Modules.Sales.Features.v1.CashShifts.SearchCashShifts;
using FSH.Modules.Sales.Features.v1.Sales.SearchSales;
using Mediator;
using NSubstitute;

namespace Sales.Tests.Features.Sales;

/// <summary>
/// Branch-scoping defaults for the list/search handlers of the branch-REQUIRED Sales entities
/// (Sale, CashShift). Omitted <c>branchId</c> defaults via <c>ICurrentBranch.ResolveListBranchFilterAsync</c>;
/// an explicit <c>branchId</c> wins; a null current branch (no tenant) leaves the query unfiltered.
/// </summary>
public sealed class SearchSalesBranchDefaultTests : IDisposable
{
    private readonly SalesDbContext _db = SalesDbContextFactory.Create();
    private readonly ICurrentBranch _currentBranch = Substitute.For<ICurrentBranch>();
    private readonly Guid _currentBranchId = Guid.CreateVersion7();
    private readonly Guid _otherBranchId = Guid.CreateVersion7();

    public void Dispose() => _db.Dispose();

    // Sale.Finalize requires at least one item and a payment method; build a valid finalized sale.
    private static Sale CompletedSale(Guid branchId)
    {
        var sale = Sale.StartBuilding(branchId, null, null, null);
        sale.AddItem(Guid.CreateVersion7(), 1m, 10m, 0m, 0m, 5m);
        sale.Finalize("Cash", 10m);
        return sale;
    }

    #region Happy Path

    [Fact]
    public async Task SearchSales_Should_DefaultToCurrentBranch_When_BranchIdOmitted()
    {
        // Arrange
        _currentBranch.ResolveListBranchFilterAsync(Arg.Any<Guid?>(), Arg.Any<CancellationToken>()).Returns(ci => ci.ArgAt<Guid?>(0) ?? _currentBranchId);
        _db.Sales.Add(CompletedSale(_currentBranchId));
        _db.Sales.Add(CompletedSale(_otherBranchId));
        await _db.SaveChangesAsync(CancellationToken.None);
        var sut = new SearchSalesQueryHandler(_db, _currentBranch, Substitute.For<IMediator>());

        // Act
        var result = await sut.Handle(new SearchSalesQuery(), CancellationToken.None);

        // Assert
        result.TotalCount.ShouldBe(1);
        result.Items.ShouldHaveSingleItem();
    }

    [Fact]
    public async Task SearchSales_Should_HonourExplicitBranchId_Over_CurrentBranch()
    {
        // Arrange
        _currentBranch.ResolveListBranchFilterAsync(Arg.Any<Guid?>(), Arg.Any<CancellationToken>()).Returns(ci => ci.ArgAt<Guid?>(0) ?? _currentBranchId);
        _db.Sales.Add(CompletedSale(_currentBranchId));
        _db.Sales.Add(CompletedSale(_otherBranchId));
        await _db.SaveChangesAsync(CancellationToken.None);
        var sut = new SearchSalesQueryHandler(_db, _currentBranch, Substitute.For<IMediator>());

        // Act
        var result = await sut.Handle(new SearchSalesQuery(BranchId: _otherBranchId), CancellationToken.None);

        // Assert
        result.TotalCount.ShouldBe(1);
    }

    [Fact]
    public async Task SearchCashShifts_Should_DefaultToCurrentBranch_When_BranchIdOmitted()
    {
        // Arrange
        _currentBranch.ResolveListBranchFilterAsync(Arg.Any<Guid?>(), Arg.Any<CancellationToken>()).Returns(ci => ci.ArgAt<Guid?>(0) ?? _currentBranchId);
        _db.CashShifts.Add(CashShift.Open(_currentBranchId, "cashier", 100m, null));
        _db.CashShifts.Add(CashShift.Open(_otherBranchId, "cashier", 100m, null));
        await _db.SaveChangesAsync(CancellationToken.None);
        var sut = new SearchCashShiftsQueryHandler(_db, _currentBranch);

        // Act
        var result = await sut.Handle(new SearchCashShiftsQuery(), CancellationToken.None);

        // Assert
        result.TotalCount.ShouldBe(1);
    }

    [Fact]
    public async Task SearchCashShifts_Should_HonourExplicitBranchId_Over_CurrentBranch()
    {
        // Arrange
        _currentBranch.ResolveListBranchFilterAsync(Arg.Any<Guid?>(), Arg.Any<CancellationToken>()).Returns(ci => ci.ArgAt<Guid?>(0) ?? _currentBranchId);
        _db.CashShifts.Add(CashShift.Open(_currentBranchId, "cashier", 100m, null));
        _db.CashShifts.Add(CashShift.Open(_otherBranchId, "cashier", 100m, null));
        await _db.SaveChangesAsync(CancellationToken.None);
        var sut = new SearchCashShiftsQueryHandler(_db, _currentBranch);

        // Act
        var result = await sut.Handle(new SearchCashShiftsQuery(BranchId: _otherBranchId), CancellationToken.None);

        // Assert
        result.TotalCount.ShouldBe(1);
    }

    #endregion

    #region Edge Cases

    [Fact]
    public async Task SearchSales_Should_ReturnAllBranches_When_CallerHoldsViewAll()
    {
        // Arrange (ViewAll caller: list filter is null even though the caller's own branch resolves)
        _currentBranch.GetBranchIdAsync(Arg.Any<CancellationToken>()).Returns(_currentBranchId);
        _currentBranch.ResolveListBranchFilterAsync(Arg.Any<Guid?>(), Arg.Any<CancellationToken>()).Returns(ci => ci.ArgAt<Guid?>(0));
        _db.Sales.Add(CompletedSale(_currentBranchId));
        _db.Sales.Add(CompletedSale(_otherBranchId));
        await _db.SaveChangesAsync(CancellationToken.None);
        var sut = new SearchSalesQueryHandler(_db, _currentBranch, Substitute.For<IMediator>());

        // Act
        var result = await sut.Handle(new SearchSalesQuery(), CancellationToken.None);

        // Assert
        result.TotalCount.ShouldBe(2);
    }

    [Fact]
    public async Task SearchSales_Should_NotFilter_When_CurrentBranchIsNull()
    {
        // Arrange (no tenant / operator call)
        _currentBranch.ResolveListBranchFilterAsync(Arg.Any<Guid?>(), Arg.Any<CancellationToken>()).Returns(ci => ci.ArgAt<Guid?>(0));
        _db.Sales.Add(CompletedSale(_currentBranchId));
        _db.Sales.Add(CompletedSale(_otherBranchId));
        await _db.SaveChangesAsync(CancellationToken.None);
        var sut = new SearchSalesQueryHandler(_db, _currentBranch, Substitute.For<IMediator>());

        // Act
        var result = await sut.Handle(new SearchSalesQuery(), CancellationToken.None);

        // Assert
        result.TotalCount.ShouldBe(2);
    }

    [Fact]
    public async Task SearchCashShifts_Should_NotFilter_When_CurrentBranchIsNull()
    {
        // Arrange
        _currentBranch.ResolveListBranchFilterAsync(Arg.Any<Guid?>(), Arg.Any<CancellationToken>()).Returns(ci => ci.ArgAt<Guid?>(0));
        _db.CashShifts.Add(CashShift.Open(_currentBranchId, "cashier", 100m, null));
        _db.CashShifts.Add(CashShift.Open(_otherBranchId, "cashier", 100m, null));
        await _db.SaveChangesAsync(CancellationToken.None);
        var sut = new SearchCashShiftsQueryHandler(_db, _currentBranch);

        // Act
        var result = await sut.Handle(new SearchCashShiftsQuery(), CancellationToken.None);

        // Assert
        result.TotalCount.ShouldBe(2);
    }

    [Fact]
    public async Task SearchSales_Should_ForwardCancellationToken_To_CurrentBranch()
    {
        // Arrange
        using var cts = new CancellationTokenSource();
        _currentBranch.ResolveListBranchFilterAsync(Arg.Any<Guid?>(), Arg.Any<CancellationToken>()).Returns(ci => ci.ArgAt<Guid?>(0));
        var sut = new SearchSalesQueryHandler(_db, _currentBranch, Substitute.For<IMediator>());

        // Act
        await sut.Handle(new SearchSalesQuery(), cts.Token);

        // Assert
        await _currentBranch.Received(1).ResolveListBranchFilterAsync(Arg.Any<Guid?>(), cts.Token);
    }

    #endregion
}
