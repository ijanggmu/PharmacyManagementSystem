using FSH.Modules.Inventory.Contracts.Services;
using FSH.Modules.Inventory.Data;
using FSH.Modules.Inventory.Domain;
using FSH.Modules.Inventory.Services;
using FSH.Modules.Multitenancy.Contracts;
using NSubstitute;

namespace Inventory.Tests.Features;

public sealed class StockReceiptServiceTests : IDisposable
{
    private readonly InventoryDbContext _db = InventoryDbContextFactory.Create();

    private StockReceiptService CreateSut(Guid branchId)
    {
        var currentBranch = Substitute.For<ICurrentBranch>();
        currentBranch.RequireBranchIdAsync(Arg.Any<CancellationToken>()).Returns(branchId);
        return new StockReceiptService(_db, currentBranch);
    }

    [Fact]
    public async Task ReceiveAsync_Should_Stamp_NewBatch_With_CurrentBranchId()
    {
        var branchId = Guid.CreateVersion7();
        var sut = CreateSut(branchId);
        var medicineId = Guid.CreateVersion7();

        var request = new StockReceiptRequest(
            "GoodsReceipt", Guid.CreateVersion7(),
            [new StockReceiptLine(medicineId, "B001", DateOnly.FromDateTime(DateTime.UtcNow.AddYears(1)), 10m, 5m, 8m)]);

        var results = await sut.ReceiveAsync(request, CancellationToken.None);

        var batch = _db.MedicineBatches.Single(b => b.Id == results[0].BatchId);
        batch.BranchId.ShouldBe(branchId);

        var transaction = _db.InventoryTransactions.Single(t => t.MedicineBatchId == batch.Id);
        transaction.BranchId.ShouldBe(branchId);
    }

    [Fact]
    public async Task ReceiveAsync_Should_Not_Increase_SameBatchNo_At_DifferentBranch()
    {
        // Same medicine + batch number already exists at Branch A — receiving the same batch number
        // at Branch B must create a NEW, separate batch row, not increment Branch A's lot.
        var branchA = Guid.CreateVersion7();
        var branchB = Guid.CreateVersion7();
        var medicineId = Guid.CreateVersion7();

        var existingAtBranchA = MedicineBatch.Create(
            medicineId, branchA, "SHARED", DateOnly.FromDateTime(DateTime.UtcNow.AddYears(1)), 10m, 5m, 8m, null);
        _db.MedicineBatches.Add(existingAtBranchA);
        await _db.SaveChangesAsync(CancellationToken.None);

        var sut = CreateSut(branchB);
        var request = new StockReceiptRequest(
            "GoodsReceipt", Guid.CreateVersion7(),
            [new StockReceiptLine(medicineId, "SHARED", DateOnly.FromDateTime(DateTime.UtcNow.AddYears(1)), 15m, 5m, 8m)]);

        await sut.ReceiveAsync(request, CancellationToken.None);

        var reloadedBranchA = _db.MedicineBatches.Single(b => b.Id == existingAtBranchA.Id);
        reloadedBranchA.QuantityOnHand.ShouldBe(10m); // untouched

        var branchBBatch = _db.MedicineBatches.Single(b => b.BranchId == branchB && b.BatchNo == "SHARED");
        branchBBatch.QuantityOnHand.ShouldBe(15m);
        branchBBatch.Id.ShouldNotBe(existingAtBranchA.Id);
    }

    [Fact]
    public async Task ReceiveAsync_Should_Increase_ExistingBatch_When_SameBranch_And_BatchNo()
    {
        var branchId = Guid.CreateVersion7();
        var medicineId = Guid.CreateVersion7();

        var existing = MedicineBatch.Create(
            medicineId, branchId, "REFILL", DateOnly.FromDateTime(DateTime.UtcNow.AddYears(1)), 10m, 5m, 8m, null);
        _db.MedicineBatches.Add(existing);
        await _db.SaveChangesAsync(CancellationToken.None);

        var sut = CreateSut(branchId);
        var request = new StockReceiptRequest(
            "GoodsReceipt", Guid.CreateVersion7(),
            [new StockReceiptLine(medicineId, "REFILL", DateOnly.FromDateTime(DateTime.UtcNow.AddYears(1)), 5m, 5m, 8m)]);

        await sut.ReceiveAsync(request, CancellationToken.None);

        _db.MedicineBatches.Count(b => b.BatchNo == "REFILL").ShouldBe(1);
        _db.MedicineBatches.Single(b => b.Id == existing.Id).QuantityOnHand.ShouldBe(15m);
    }

    public void Dispose() => _db.Dispose();
}
