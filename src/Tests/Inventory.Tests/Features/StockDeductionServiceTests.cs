using FSH.Modules.Inventory.Contracts.Services;
using FSH.Modules.Inventory.Data;
using FSH.Modules.Inventory.Domain;
using FSH.Modules.Inventory.Services;
using FSH.Modules.Multitenancy.Contracts;
using NSubstitute;

namespace Inventory.Tests.Features;

/// <summary>
/// Branch-scoping safety tests for <see cref="StockDeductionService"/> — the single most
/// correctness-critical change in the Inventory branch-scoping wave (docs/branch-scoping-plan.md):
/// a sale at one branch must never draw down another branch's physical stock.
/// </summary>
public sealed class StockDeductionServiceTests : IDisposable
{
    private readonly InventoryDbContext _db = InventoryDbContextFactory.Create();

    private StockDeductionService CreateSut(Guid branchId, InventoryDbContext? db = null)
    {
        var currentBranch = Substitute.For<ICurrentBranch>();
        currentBranch.RequireBranchIdAsync(Arg.Any<CancellationToken>()).Returns(branchId);
        return new StockDeductionService(db ?? _db, currentBranch);
    }

    [Fact]
    public async Task DeductForSaleAsync_Should_Deduct_Against_Requantities_When_Batch_Changed_Since_Load()
    {
        // Arrange — this context has the batch tracked at 10 units. Another writer (a concurrent sale
        // that committed first, simulated with a second context on the same store) takes it down to 3.
        // The deduction must read the current quantity after the lock, not reuse the stale tracked 10.
        var branchId = Guid.CreateVersion7();
        var medicineId = Guid.CreateVersion7();
        string storeName = Guid.NewGuid().ToString();
        using var db = InventoryDbContextFactory.Create(storeName);

        var batch = MedicineBatch.Create(
            medicineId, branchId, "RACE-LOT", DateOnly.FromDateTime(DateTime.UtcNow.AddYears(1)), 10m, 5m, 10m, null);
        db.MedicineBatches.Add(batch);
        await db.SaveChangesAsync(CancellationToken.None);

        using (var other = InventoryDbContextFactory.Create(storeName))
        {
            var otherBatch = other.MedicineBatches.Single(b => b.Id == batch.Id);
            otherBatch.SetQuantity(3m);
            await other.SaveChangesAsync(CancellationToken.None);
        }

        var sut = CreateSut(branchId, db);
        var request = new StockDeductionRequest("Sale", Guid.CreateVersion7(), [new StockDeductionLine(medicineId, 5m)]);

        // Act / Assert — 5 requested, 3 actually on hand now.
        var ex = await Should.ThrowAsync<InsufficientStockException>(
            () => sut.DeductForSaleAsync(request, CancellationToken.None).AsTask());
        ex.Shortfalls.ShouldHaveSingleItem().Available.ShouldBe(3m);
    }

    [Fact]
    public async Task DeductForSaleAsync_Should_Reject_Two_Lines_Of_Same_Medicine_When_Combined_Quantity_Exceeds_Stock()
    {
        // Arrange — 10 on hand. Two lines of 6 each pass a per-line check, but together need 12.
        // Nothing may be deducted.
        var branchId = Guid.CreateVersion7();
        var medicineId = Guid.CreateVersion7();
        var batch = MedicineBatch.Create(
            medicineId, branchId, "SPLIT-LOT", DateOnly.FromDateTime(DateTime.UtcNow.AddYears(1)), 10m, 5m, 10m, null);
        _db.MedicineBatches.Add(batch);
        await _db.SaveChangesAsync(CancellationToken.None);

        var sut = CreateSut(branchId);
        var request = new StockDeductionRequest(
            "Sale", Guid.CreateVersion7(),
            [new StockDeductionLine(medicineId, 6m), new StockDeductionLine(medicineId, 6m)]);

        // Act / Assert
        var ex = await Should.ThrowAsync<InsufficientStockException>(
            () => sut.DeductForSaleAsync(request, CancellationToken.None).AsTask());
        ex.Shortfalls.ShouldHaveSingleItem().Available.ShouldBe(10m);

        _db.MedicineBatches.Single(b => b.Id == batch.Id).QuantityOnHand.ShouldBe(10m);
        _db.InventoryTransactions.Count().ShouldBe(0);
    }

    [Fact]
    public async Task DeductForSaleAsync_Should_Split_Across_FEFO_Batches_And_Use_Remaining_Quantity_For_Second_Line()
    {
        // Arrange — earliest-expiry batch first. Lines 8 + 4 = 12 from 5 (soonest) + 10 (later).
        var branchId = Guid.CreateVersion7();
        var medicineId = Guid.CreateVersion7();
        var soon = MedicineBatch.Create(
            medicineId, branchId, "SOON", DateOnly.FromDateTime(DateTime.UtcNow.AddMonths(3)), 5m, 2m, 10m, null);
        var later = MedicineBatch.Create(
            medicineId, branchId, "LATER", DateOnly.FromDateTime(DateTime.UtcNow.AddMonths(9)), 10m, 4m, 10m, null);
        _db.MedicineBatches.AddRange(soon, later);
        await _db.SaveChangesAsync(CancellationToken.None);

        var sut = CreateSut(branchId);
        var request = new StockDeductionRequest(
            "Sale", Guid.CreateVersion7(),
            [new StockDeductionLine(medicineId, 8m), new StockDeductionLine(medicineId, 4m)]);

        // Act
        var results = await sut.DeductForSaleAsync(request, CancellationToken.None);

        // Assert — line 1: 5 from SOON + 3 from LATER; line 2: 4 from LATER.
        results[0].Batches.Select(b => (b.BatchNo, b.QuantityDeducted)).ToArray()
            .ShouldBe(new (string, decimal)[] { ("SOON", 5m), ("LATER", 3m) });
        results[1].Batches.Select(b => (b.BatchNo, b.QuantityDeducted)).ToArray()
            .ShouldBe(new (string, decimal)[] { ("LATER", 4m) });
        _db.MedicineBatches.Single(b => b.Id == soon.Id).QuantityOnHand.ShouldBe(0m);
        _db.MedicineBatches.Single(b => b.Id == later.Id).QuantityOnHand.ShouldBe(3m);
    }

    [Fact]
    public async Task DeductForSaleAsync_Should_Throw_InsufficientStock_When_Only_OtherBranch_Has_Stock()
    {
        // Arrange — medicine has plenty of stock, but all of it sits at Branch B. A sale request
        // resolved to Branch A must see this as "nothing available", not silently draw from Branch B.
        var branchA = Guid.CreateVersion7();
        var branchB = Guid.CreateVersion7();
        var medicineId = Guid.CreateVersion7();

        var branchBBatch = MedicineBatch.Create(
            medicineId, branchB, "B-ONLY", DateOnly.FromDateTime(DateTime.UtcNow.AddYears(1)), 100m, 5m, 10m, null);
        _db.MedicineBatches.Add(branchBBatch);
        await _db.SaveChangesAsync(CancellationToken.None);

        var sut = CreateSut(branchA);
        var request = new StockDeductionRequest(
            "Sale", Guid.CreateVersion7(), [new StockDeductionLine(medicineId, 10m)]);

        // Act / Assert
        var ex = await Should.ThrowAsync<InsufficientStockException>(
            () => sut.DeductForSaleAsync(request, CancellationToken.None).AsTask());
        ex.Shortfalls.ShouldHaveSingleItem().Available.ShouldBe(0m);

        // Branch B's stock must be untouched.
        var reloaded = _db.MedicineBatches.Single(b => b.Id == branchBBatch.Id);
        reloaded.QuantityOnHand.ShouldBe(100m);
    }

    [Fact]
    public async Task DeductForSaleAsync_Should_Only_Deduct_RequestedBranch_Batch_When_SameMedicine_Has_Batches_At_BothBranches()
    {
        // Arrange — the same medicine has stock at both branches. A sale resolved to Branch A must
        // only ever touch Branch A's batch.
        var branchA = Guid.CreateVersion7();
        var branchB = Guid.CreateVersion7();
        var medicineId = Guid.CreateVersion7();

        var batchA = MedicineBatch.Create(
            medicineId, branchA, "A-LOT", DateOnly.FromDateTime(DateTime.UtcNow.AddYears(1)), 20m, 5m, 10m, null);
        var batchB = MedicineBatch.Create(
            medicineId, branchB, "B-LOT", DateOnly.FromDateTime(DateTime.UtcNow.AddYears(1)), 20m, 5m, 10m, null);
        _db.MedicineBatches.Add(batchA);
        _db.MedicineBatches.Add(batchB);
        await _db.SaveChangesAsync(CancellationToken.None);

        var sut = CreateSut(branchA);
        var request = new StockDeductionRequest(
            "Sale", Guid.CreateVersion7(), [new StockDeductionLine(medicineId, 15m)]);

        // Act
        var results = await sut.DeductForSaleAsync(request, CancellationToken.None);

        // Assert
        var detail = results.ShouldHaveSingleItem();
        detail.Batches.ShouldHaveSingleItem().BatchId.ShouldBe(batchA.Id);

        var reloadedA = _db.MedicineBatches.Single(b => b.Id == batchA.Id);
        var reloadedB = _db.MedicineBatches.Single(b => b.Id == batchB.Id);
        reloadedA.QuantityOnHand.ShouldBe(5m);
        reloadedB.QuantityOnHand.ShouldBe(20m); // untouched

        var transaction = _db.InventoryTransactions.Single(t => t.MedicineBatchId == batchA.Id);
        transaction.BranchId.ShouldBe(branchA);
    }

    [Fact]
    public async Task DeductForSupplierReturnAsync_Should_Also_Filter_By_Branch()
    {
        var branchA = Guid.CreateVersion7();
        var branchB = Guid.CreateVersion7();
        var medicineId = Guid.CreateVersion7();

        var branchBBatch = MedicineBatch.Create(
            medicineId, branchB, "B-ONLY", DateOnly.FromDateTime(DateTime.UtcNow.AddYears(1)), 50m, 5m, 10m, null);
        _db.MedicineBatches.Add(branchBBatch);
        await _db.SaveChangesAsync(CancellationToken.None);

        var sut = CreateSut(branchA);
        var request = new StockDeductionRequest(
            "SupplierReturn", Guid.CreateVersion7(), [new StockDeductionLine(medicineId, 5m)]);

        await Should.ThrowAsync<InsufficientStockException>(
            () => sut.DeductForSupplierReturnAsync(request, CancellationToken.None).AsTask());
    }

    [Fact]
    public async Task RestockFromCancellationAsync_Should_Create_NewBatch_With_CurrentBranchId()
    {
        var branchId = Guid.CreateVersion7();
        var medicineId = Guid.CreateVersion7();
        var sut = CreateSut(branchId);

        var original = new List<StockDeductionLineResult>
        {
            new(medicineId, 10m, [new BatchDeductionDetail(Guid.CreateVersion7(), "ORIG", 10m, 5m)]),
        };

        await sut.RestockFromCancellationAsync("Sale", Guid.CreateVersion7(), original, CancellationToken.None);

        var batch = _db.MedicineBatches.Single(b => b.MedicineId == medicineId);
        batch.BranchId.ShouldBe(branchId);

        var transaction = _db.InventoryTransactions.Single(t => t.MedicineBatchId == batch.Id);
        transaction.BranchId.ShouldBe(branchId);
    }

    public void Dispose() => _db.Dispose();
}
