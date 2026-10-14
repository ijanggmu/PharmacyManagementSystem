using FSH.Modules.Inventory.Contracts.v1.Reports;
using FSH.Modules.Inventory.Data;
using FSH.Modules.Inventory.Domain;
using FSH.Modules.Inventory.Features.v1.Reports.GetStockValuation;
using NSubstitute;

namespace Inventory.Tests.Features;

public sealed class GetStockValuationQueryHandlerTests : IDisposable
{
    private readonly InventoryDbContext _db = InventoryDbContextFactory.Create();
    private readonly GetStockValuationQueryHandler _sut;
    private readonly Guid _branchA = Guid.CreateVersion7();
    private readonly Guid _branchB = Guid.CreateVersion7();

    /// <summary>A caller with access to every branch: the requested branch filter is used as given.</summary>
    private static FSH.Modules.Multitenancy.Contracts.ICurrentBranch AllBranches()
    {
        var branch = Substitute.For<FSH.Modules.Multitenancy.Contracts.ICurrentBranch>();
        branch.ResolveListBranchFilterAsync(Arg.Any<Guid?>(), Arg.Any<CancellationToken>()).Returns(ci => ci.ArgAt<Guid?>(0));
        branch.CanViewAllBranchesAsync(Arg.Any<CancellationToken>()).Returns(true);
        return branch;
    }

    public GetStockValuationQueryHandlerTests()
    {
        _sut = new GetStockValuationQueryHandler(_db, AllBranches());
    }

    public void Dispose() => _db.Dispose();

    [Fact]
    public async Task Handle_Should_ValueEveryBranch_When_BranchIdOmitted()
    {
        await SeedAsync();

        var result = await _sut.Handle(new GetStockValuationQuery(), CancellationToken.None);

        result.ShouldBe(36m);
    }

    [Fact]
    public async Task Handle_Should_ValueOnlyThatBranchBatches_When_BranchIdProvided()
    {
        await SeedAsync();

        (await _sut.Handle(new GetStockValuationQuery(_branchA), CancellationToken.None)).ShouldBe(20m);
        (await _sut.Handle(new GetStockValuationQuery(_branchB), CancellationToken.None)).ShouldBe(16m);
        (await _sut.Handle(new GetStockValuationQuery(Guid.CreateVersion7()), CancellationToken.None)).ShouldBe(0m);
    }

    [Fact]
    public async Task Handle_Should_LeaveOutConsignedLots_And_CountInTransitStockAtTheSourceBranch()
    {
        await SeedAsync();
        var medicine = _db.Medicines.Single();
        var expiry = DateOnly.FromDateTime(DateTime.UtcNow.AddYears(1));

        // Supplier-owned: 100 x 5 at branch A must not count.
        var consigned = MedicineBatch.Create(medicine.Id, _branchA, "C1", expiry, 100m, 5m, 6m, null);
        _db.MedicineBatches.Add(consigned);
        _db.ConsignmentPositions.Add(ConsignmentPosition.Create(
            Guid.CreateVersion7(), medicine.Id, consigned.Id, "C1", 100m, 5m, DateTime.UtcNow, _branchA));

        // 3 x 2.5 dispatched from A to B, not received yet: still A's stock. A received transfer adds nothing.
        var inTransit = StockTransfer.Create(_branchA, _branchB, Guid.CreateVersion7(), null, [(medicine.Id, 3m)]);
        var received = StockTransfer.Create(_branchA, _branchB, Guid.CreateVersion7(), null, [(medicine.Id, 1m)]);
        received.MarkReceived(Guid.CreateVersion7());
        _db.StockTransfers.AddRange(inTransit, received);
        _db.StockTransferBatches.Add(StockTransferBatch.Create(inTransit.Id, medicine.Id, Guid.CreateVersion7(), "A1", expiry, 3m, 2.5m, 3m));
        _db.StockTransferBatches.Add(StockTransferBatch.Create(received.Id, medicine.Id, Guid.CreateVersion7(), "A1", expiry, 1m, 2.5m, 3m));
        await _db.SaveChangesAsync(CancellationToken.None);

        (await _sut.Handle(new GetStockValuationQuery(_branchA), CancellationToken.None)).ShouldBe(27.5m);
        (await _sut.Handle(new GetStockValuationQuery(_branchB), CancellationToken.None)).ShouldBe(16m);
        (await _sut.Handle(new GetStockValuationQuery(), CancellationToken.None)).ShouldBe(43.5m);
    }

    private async Task SeedAsync()
    {
        var medicine = Medicine.Create("Paracetamol", null, null, reorderLevel: 0);
        _db.Medicines.Add(medicine);
        var expiry = DateOnly.FromDateTime(DateTime.UtcNow.AddYears(1));
        // Branch A: 10 x 2 = 20. Branch B: 4 x 4 = 16.
        _db.MedicineBatches.Add(MedicineBatch.Create(medicine.Id, _branchA, "A1", expiry, 10m, 2m, 3m, null));
        _db.MedicineBatches.Add(MedicineBatch.Create(medicine.Id, _branchB, "B1", expiry, 4m, 4m, 6m, null));
        await _db.SaveChangesAsync(CancellationToken.None);
    }
}
