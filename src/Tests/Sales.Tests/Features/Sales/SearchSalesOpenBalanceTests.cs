using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Sales.Contracts.v1.Sales;
using FSH.Modules.Sales.Data;
using FSH.Modules.Sales.Domain;
using FSH.Modules.Sales.Features.v1.Sales.SearchSales;
using Mediator;
using NSubstitute;

namespace Sales.Tests.Features.Sales;

/// <summary>
/// <c>SearchSalesQuery.OnlyWithBalanceDue</c> is how a customer's "open invoices" (unpaid/partially-paid
/// credit sales) are fetched — this is the filter the receivables tab's open-invoices list runs against.
/// </summary>
public sealed class SearchSalesOpenBalanceTests : IDisposable
{
    private readonly SalesDbContext _db = SalesDbContextFactory.Create();
    private readonly ICurrentBranch _currentBranch = Substitute.For<ICurrentBranch>();
    private readonly Guid _branchId = Guid.CreateVersion7();
    private readonly Guid _customerId = Guid.CreateVersion7();

    public SearchSalesOpenBalanceTests()
    {
        _currentBranch.ResolveListBranchFilterAsync(Arg.Any<Guid?>(), Arg.Any<CancellationToken>()).Returns(ci => ci.ArgAt<Guid?>(0) ?? _branchId);
    }

    public void Dispose() => _db.Dispose();

    /// <summary>A fully-paid sale: no balance due.</summary>
    private Sale PaidSale()
    {
        var sale = Sale.StartBuilding(_branchId, _customerId, null, null);
        sale.AddItem(Guid.CreateVersion7(), 1m, 100m, 0m, 0m, 50m);
        sale.Finalize("Cash", 100m);
        return sale;
    }

    /// <summary>A sale on account: partially paid, leaving <c>total - paidAmount</c> owed.</summary>
    private Sale OpenSale(decimal total, decimal paidAmount)
    {
        var sale = Sale.StartBuilding(_branchId, _customerId, null, null);
        sale.AddItem(Guid.CreateVersion7(), 1m, total, 0m, 0m, total / 2);
        sale.Finalize("Cash", paidAmount);
        return sale;
    }

    [Fact]
    public async Task Should_ReturnOnlySalesWithBalanceDue_When_OnlyWithBalanceDueIsTrue()
    {
        // Arrange
        _db.Sales.Add(PaidSale());
        _db.Sales.Add(OpenSale(200m, 50m));
        await _db.SaveChangesAsync(CancellationToken.None);
        var sut = new SearchSalesQueryHandler(_db, _currentBranch, Substitute.For<IMediator>());

        // Act
        var result = await sut.Handle(
            new SearchSalesQuery(CustomerId: _customerId, OnlyWithBalanceDue: true), CancellationToken.None);

        // Assert
        result.TotalCount.ShouldBe(1);
        result.Items.ShouldHaveSingleItem().BalanceDue.ShouldBe(150m);
    }

    [Fact]
    public async Task Should_ReturnAllSales_When_OnlyWithBalanceDueIsFalse()
    {
        // Arrange
        _db.Sales.Add(PaidSale());
        _db.Sales.Add(OpenSale(200m, 50m));
        await _db.SaveChangesAsync(CancellationToken.None);
        var sut = new SearchSalesQueryHandler(_db, _currentBranch, Substitute.For<IMediator>());

        // Act
        var result = await sut.Handle(new SearchSalesQuery(CustomerId: _customerId), CancellationToken.None);

        // Assert
        result.TotalCount.ShouldBe(2);
    }

    [Fact]
    public async Task Should_OrderOldestFirst_When_OnlyWithBalanceDueIsTrue()
    {
        // Arrange: two open sales, saved in an arbitrary order with distinct sale dates.
        var older = OpenSale(200m, 50m);
        var newer = OpenSale(300m, 100m);
        typeof(Sale).GetProperty(nameof(Sale.SaleDateUtc))!.SetValue(older, DateTime.UtcNow.AddDays(-5));
        typeof(Sale).GetProperty(nameof(Sale.SaleDateUtc))!.SetValue(newer, DateTime.UtcNow);
        _db.Sales.Add(newer);
        _db.Sales.Add(older);
        await _db.SaveChangesAsync(CancellationToken.None);
        var sut = new SearchSalesQueryHandler(_db, _currentBranch, Substitute.For<IMediator>());

        // Act
        var result = await sut.Handle(
            new SearchSalesQuery(CustomerId: _customerId, OnlyWithBalanceDue: true), CancellationToken.None);

        // Assert
        var items = result.Items.ToList();
        items[0].Id.ShouldBe(older.Id);
        items[1].Id.ShouldBe(newer.Id);
    }
}
