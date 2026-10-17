using FSH.Modules.Inventory.Contracts.v1.Batches;
using FSH.Modules.Inventory.Contracts.v1.StockTransfers;
using FSH.Modules.Inventory.Contracts.v1.Transactions;
using FSH.Modules.Inventory.Data;
using FSH.Modules.Inventory.Domain;
using FSH.Modules.Inventory.Features.v1.Batches.SearchBatches;
using FSH.Modules.Inventory.Features.v1.StockTransfers.SearchStockTransfers;
using FSH.Modules.Inventory.Features.v1.Transactions.SearchInventoryTransactions;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Multitenancy.Contracts.Dtos;
using FSH.Modules.Multitenancy.Contracts.v1.GetBranchById;
using Mediator;
using NSubstitute;

namespace Inventory.Tests.Features;

/// <summary>
/// Branch-REQUIRED Inventory entities (MedicineBatch, InventoryTransaction, StockTransfer): an omitted
/// <c>branchId</c> defaults via <c>ICurrentBranch.ResolveListBranchFilterAsync</c>, an explicit one is honoured, and a
/// null current branch (no tenant) leaves the query unfiltered.
/// </summary>
public sealed class BranchDefaultQueryTests : IDisposable
{
    private readonly InventoryDbContext _db = InventoryDbContextFactory.Create();
    private readonly ICurrentBranch _currentBranch = Substitute.For<ICurrentBranch>();
    private readonly IMediator _mediator = BranchNameMediator();

    private static IMediator BranchNameMediator()
    {
        var mediator = Substitute.For<IMediator>();
#pragma warning disable CA2012 // NSubstitute stores the ValueTask as a configured return value, not as a consumed one.
        mediator.Send(Arg.Any<GetBranchByIdQuery>(), Arg.Any<CancellationToken>())
            .Returns(_ => new ValueTask<BranchDto>(new BranchDto { Name = "Main", Code = "MAIN" }));
#pragma warning restore CA2012
        return mediator;
    }
    private readonly Guid _currentBranchId = Guid.CreateVersion7();
    private readonly Guid _otherBranchId = Guid.CreateVersion7();

    public void Dispose() => _db.Dispose();

    #region Happy Path

    [Fact]
    public async Task SearchBatches_Should_DefaultToCurrentBranch_When_BranchIdOmitted()
    {
        // Arrange
        _currentBranch.ResolveListBranchFilterAsync(Arg.Any<Guid?>(), Arg.Any<CancellationToken>()).Returns(ci => ci.ArgAt<Guid?>(0) ?? _currentBranchId);
        await SeedBatchesAsync();
        var sut = new SearchBatchesQueryHandler(_db, _currentBranch, _mediator);

        // Act
        var result = await sut.Handle(new SearchBatchesQuery(), CancellationToken.None);

        // Assert
        result.Items.ShouldHaveSingleItem().BatchNo.ShouldBe("CUR1");
    }

    [Fact]
    public async Task SearchBatches_Should_HonourExplicitBranchId_Over_CurrentBranch()
    {
        // Arrange
        _currentBranch.ResolveListBranchFilterAsync(Arg.Any<Guid?>(), Arg.Any<CancellationToken>()).Returns(ci => ci.ArgAt<Guid?>(0) ?? _currentBranchId);
        await SeedBatchesAsync();
        var sut = new SearchBatchesQueryHandler(_db, _currentBranch, _mediator);

        // Act
        var result = await sut.Handle(new SearchBatchesQuery(BranchId: _otherBranchId), CancellationToken.None);

        // Assert
        result.Items.ShouldHaveSingleItem().BatchNo.ShouldBe("OTH1");
    }

    [Fact]
    public async Task SearchInventoryTransactions_Should_DefaultToCurrentBranch_When_BranchIdOmitted()
    {
        // Arrange
        _currentBranch.ResolveListBranchFilterAsync(Arg.Any<Guid?>(), Arg.Any<CancellationToken>()).Returns(ci => ci.ArgAt<Guid?>(0) ?? _currentBranchId);
        await SeedTransactionsAsync();
        var sut = new SearchInventoryTransactionsQueryHandler(_db, _currentBranch, Substitute.For<Mediator.IMediator>(), Substitute.For<FSH.Modules.Identity.Contracts.Services.IUserService>());

        // Act
        var result = await sut.Handle(new SearchInventoryTransactionsQuery(), CancellationToken.None);

        // Assert
        result.Items.ShouldHaveSingleItem().QuantityDelta.ShouldBe(5m);
    }

    [Fact]
    public async Task SearchInventoryTransactions_Should_HonourExplicitBranchId_Over_CurrentBranch()
    {
        // Arrange
        _currentBranch.ResolveListBranchFilterAsync(Arg.Any<Guid?>(), Arg.Any<CancellationToken>()).Returns(ci => ci.ArgAt<Guid?>(0) ?? _currentBranchId);
        await SeedTransactionsAsync();
        var sut = new SearchInventoryTransactionsQueryHandler(_db, _currentBranch, Substitute.For<Mediator.IMediator>(), Substitute.For<FSH.Modules.Identity.Contracts.Services.IUserService>());

        // Act
        var result = await sut.Handle(new SearchInventoryTransactionsQuery(BranchId: _otherBranchId), CancellationToken.None);

        // Assert
        result.Items.ShouldHaveSingleItem().QuantityDelta.ShouldBe(7m);
    }

    [Fact]
    public async Task SearchStockTransfers_Should_DefaultToCurrentBranch_When_BranchIdOmitted()
    {
        // Arrange
        _currentBranch.ResolveListBranchFilterAsync(Arg.Any<Guid?>(), Arg.Any<CancellationToken>()).Returns(ci => ci.ArgAt<Guid?>(0) ?? _currentBranchId);
        var involvingCurrent = await SeedTransfersAsync();
        var sut = new SearchStockTransfersQueryHandler(_db, _currentBranch);

        // Act
        var result = await sut.Handle(new SearchStockTransfersQuery(), CancellationToken.None);

        // Assert
        result.Items.ShouldHaveSingleItem().Id.ShouldBe(involvingCurrent.Id);
    }

    [Fact]
    public async Task SearchStockTransfers_Should_HonourExplicitBranchId_Over_CurrentBranch()
    {
        // Arrange
        _currentBranch.ResolveListBranchFilterAsync(Arg.Any<Guid?>(), Arg.Any<CancellationToken>()).Returns(ci => ci.ArgAt<Guid?>(0) ?? _currentBranchId);
        await SeedTransfersAsync();
        var sut = new SearchStockTransfersQueryHandler(_db, _currentBranch);

        // Act: an explicit, unrelated branch must replace the current branch (no transfer touches it).
        var result = await sut.Handle(new SearchStockTransfersQuery(BranchId: Guid.CreateVersion7()), CancellationToken.None);

        // Assert
        result.TotalCount.ShouldBe(0);
    }

    #endregion

    #region Edge Cases

    [Fact]
    public async Task SearchBatches_Should_ReturnAllBranches_When_CallerHoldsViewAll()
    {
        // Arrange (ViewAll caller: list filter is null even though the caller's own branch resolves)
        _currentBranch.GetBranchIdAsync(Arg.Any<CancellationToken>()).Returns(_currentBranchId);
        _currentBranch.ResolveListBranchFilterAsync(Arg.Any<Guid?>(), Arg.Any<CancellationToken>()).Returns(ci => ci.ArgAt<Guid?>(0));
        await SeedBatchesAsync();
        var sut = new SearchBatchesQueryHandler(_db, _currentBranch, _mediator);

        // Act
        var result = await sut.Handle(new SearchBatchesQuery(), CancellationToken.None);

        // Assert
        result.TotalCount.ShouldBe(2);
    }

    [Fact]
    public async Task SearchBatches_Should_NotFilter_When_CurrentBranchIsNull()
    {
        // Arrange
        _currentBranch.ResolveListBranchFilterAsync(Arg.Any<Guid?>(), Arg.Any<CancellationToken>()).Returns(ci => ci.ArgAt<Guid?>(0));
        await SeedBatchesAsync();
        var sut = new SearchBatchesQueryHandler(_db, _currentBranch, _mediator);

        // Act
        var result = await sut.Handle(new SearchBatchesQuery(), CancellationToken.None);

        // Assert
        result.TotalCount.ShouldBe(2);
    }

    [Fact]
    public async Task SearchInventoryTransactions_Should_NotFilter_When_CurrentBranchIsNull()
    {
        // Arrange
        _currentBranch.ResolveListBranchFilterAsync(Arg.Any<Guid?>(), Arg.Any<CancellationToken>()).Returns(ci => ci.ArgAt<Guid?>(0));
        await SeedTransactionsAsync();
        var sut = new SearchInventoryTransactionsQueryHandler(_db, _currentBranch, Substitute.For<Mediator.IMediator>(), Substitute.For<FSH.Modules.Identity.Contracts.Services.IUserService>());

        // Act
        var result = await sut.Handle(new SearchInventoryTransactionsQuery(), CancellationToken.None);

        // Assert
        result.TotalCount.ShouldBe(2);
    }

    [Fact]
    public async Task SearchStockTransfers_Should_NotFilter_When_CurrentBranchIsNull()
    {
        // Arrange
        _currentBranch.ResolveListBranchFilterAsync(Arg.Any<Guid?>(), Arg.Any<CancellationToken>()).Returns(ci => ci.ArgAt<Guid?>(0));
        await SeedTransfersAsync();
        var sut = new SearchStockTransfersQueryHandler(_db, _currentBranch);

        // Act
        var result = await sut.Handle(new SearchStockTransfersQuery(), CancellationToken.None);

        // Assert
        result.TotalCount.ShouldBe(2);
    }

    #endregion

    private async Task SeedBatchesAsync()
    {
        var medicine = Medicine.Create("Paracetamol", null, null, reorderLevel: 0);
        _db.Medicines.Add(medicine);
        var expiry = DateOnly.FromDateTime(DateTime.UtcNow.AddYears(1));
        _db.MedicineBatches.Add(MedicineBatch.Create(medicine.Id, _currentBranchId, "CUR1", expiry, 10m, 1m, 2m, null));
        _db.MedicineBatches.Add(MedicineBatch.Create(medicine.Id, _otherBranchId, "OTH1", expiry, 20m, 1m, 2m, null));
        await _db.SaveChangesAsync(CancellationToken.None);
    }

    private async Task SeedTransactionsAsync()
    {
        var medicineId = Guid.CreateVersion7();
        _db.InventoryTransactions.Add(InventoryTransaction.Create(
            medicineId, _currentBranchId, null, InventoryTransactionType.Adjustment, 5m, 1m));
        _db.InventoryTransactions.Add(InventoryTransaction.Create(
            medicineId, _otherBranchId, null, InventoryTransactionType.Adjustment, 7m, 1m));
        await _db.SaveChangesAsync(CancellationToken.None);
    }

    private async Task<StockTransfer> SeedTransfersAsync()
    {
        var medicineId = Guid.CreateVersion7();
        var involvingCurrent = StockTransfer.Create(
            _currentBranchId, _otherBranchId, Guid.CreateVersion7(), null,
            [(medicineId, 5m)]);
        var involvingOther = StockTransfer.Create(
            _otherBranchId, Guid.CreateVersion7(), Guid.CreateVersion7(), null,
            [(medicineId, 5m)]);
        _db.StockTransfers.Add(involvingCurrent);
        _db.StockTransfers.Add(involvingOther);
        await _db.SaveChangesAsync(CancellationToken.None);
        return involvingCurrent;
    }
}
