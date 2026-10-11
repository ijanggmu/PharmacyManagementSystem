using FSH.Modules.Inventory.Contracts.Services;
using FSH.Modules.Inventory.Data;
using FSH.Modules.Inventory.Domain;
using FSH.Modules.Inventory.Services;
using FSH.Modules.Multitenancy.Contracts;
using NSubstitute;

namespace Inventory.Tests.Features;

/// <summary>
/// FEFO must never sell (or transfer out) a lot that has expired by today's Nepal date, availability is
/// checked against the same sellable set, and results come back in the caller's line order.
/// </summary>
public sealed class StockDeductionExpiryAndOrderTests : IDisposable
{
    private readonly InventoryDbContext _db = InventoryDbContextFactory.Create();
    private readonly Guid _branchId = Guid.CreateVersion7();
    private readonly Guid _medicineId = Guid.CreateVersion7();
    private readonly DateOnly _today = NepalClock.Today();

    private StockDeductionService CreateSut()
    {
        var currentBranch = Substitute.For<ICurrentBranch>();
        currentBranch.RequireBranchIdAsync(Arg.Any<CancellationToken>()).Returns(_branchId);
        return new StockDeductionService(_db, currentBranch);
    }

    private MedicineBatch AddLot(string batchNo, DateOnly expiry, decimal quantity, Guid? medicineId = null)
    {
        var batch = MedicineBatch.Create(medicineId ?? _medicineId, _branchId, batchNo, expiry, quantity, 5m, 10m, null);
        _db.MedicineBatches.Add(batch);
        _db.SaveChanges();
        return batch;
    }

    [Fact]
    public async Task DeductForSaleAsync_Should_Skip_Expired_Lot_And_Draw_From_Next_Sellable_Lot()
    {
        var expired = AddLot("OLD", _today.AddDays(-1), 10m);
        var good = AddLot("NEW", _today.AddMonths(6), 10m);

        var results = await CreateSut().DeductForSaleAsync(
            new StockDeductionRequest("Sale", Guid.CreateVersion7(), [new StockDeductionLine(_medicineId, 4m)]));

        results.ShouldHaveSingleItem().Batches.ShouldHaveSingleItem().BatchId.ShouldBe(good.Id);
        _db.MedicineBatches.Single(b => b.Id == expired.Id).QuantityOnHand.ShouldBe(10m);
        _db.MedicineBatches.Single(b => b.Id == good.Id).QuantityOnHand.ShouldBe(6m);
    }

    [Fact]
    public async Task DeductForSaleAsync_Should_Sell_Lot_That_Expires_Today()
    {
        var lastDay = AddLot("TODAY", _today, 3m);

        var results = await CreateSut().DeductForSaleAsync(
            new StockDeductionRequest("Sale", Guid.CreateVersion7(), [new StockDeductionLine(_medicineId, 3m)]));

        results.ShouldHaveSingleItem().Batches.ShouldHaveSingleItem().BatchId.ShouldBe(lastDay.Id);
    }

    [Fact]
    public async Task DeductForSaleAsync_Should_Report_Only_Sellable_Stock_As_Available_When_Rest_Is_Expired()
    {
        AddLot("OLD", _today.AddDays(-30), 50m);
        AddLot("NEW", _today.AddMonths(6), 2m);

        var ex = await Should.ThrowAsync<InsufficientStockException>(() => CreateSut().DeductForSaleAsync(
            new StockDeductionRequest("Sale", Guid.CreateVersion7(), [new StockDeductionLine(_medicineId, 5m)])).AsTask());

        ex.Shortfalls.ShouldHaveSingleItem().Available.ShouldBe(2m);
        _db.MedicineBatches.Sum(b => b.QuantityOnHand).ShouldBe(52m);
    }

    [Fact]
    public async Task DeductForSaleAsync_Should_Reject_Pinned_Expired_Lot()
    {
        var expired = AddLot("OLD", _today.AddDays(-1), 10m);

        await Should.ThrowAsync<InsufficientStockException>(() => CreateSut().DeductForSaleAsync(
            new StockDeductionRequest("Sale", Guid.CreateVersion7(), [new StockDeductionLine(_medicineId, 1m, expired.Id)])).AsTask());
    }

    [Fact]
    public async Task DeductForTransferAsync_Should_Not_Move_Expired_Stock()
    {
        AddLot("OLD", _today.AddDays(-1), 10m);

        await Should.ThrowAsync<InsufficientStockException>(() => CreateSut().DeductForTransferAsync(
            new StockDeductionRequest("StockTransfer", Guid.CreateVersion7(), [new StockDeductionLine(_medicineId, 1m)])).AsTask());
    }

    [Fact]
    public async Task DeductForSupplierReturnAsync_Should_Still_Return_Expired_Lot()
    {
        var expired = AddLot("OLD", _today.AddDays(-10), 10m);

        var results = await CreateSut().DeductForSupplierReturnAsync(
            new StockDeductionRequest("SupplierReturn", Guid.CreateVersion7(), [new StockDeductionLine(_medicineId, 10m, expired.Id)]));

        results.ShouldHaveSingleItem().Batches.ShouldHaveSingleItem().BatchId.ShouldBe(expired.Id);
        _db.MedicineBatches.Single().QuantityOnHand.ShouldBe(0m);
    }

    [Fact]
    public async Task DeductAsync_Should_Return_Results_In_Request_Line_Order_When_Pinned_And_Fefo_Lines_Mix()
    {
        // Line 0 is FEFO (medicine A), line 1 is pinned (medicine B, lot B-2), line 2 is FEFO (medicine B).
        // Pinned lines are deducted first, but result[i] must still describe request line i — the
        // supplier return's debit note pairs them by index.
        var medicineA = Guid.CreateVersion7();
        var medicineB = Guid.CreateVersion7();
        var a1 = AddLot("A-1", _today.AddMonths(3), 10m, medicineA);
        var b1 = AddLot("B-1", _today.AddMonths(1), 10m, medicineB);
        var b2 = AddLot("B-2", _today.AddMonths(9), 10m, medicineB);

        var results = await CreateSut().DeductForSupplierReturnAsync(new StockDeductionRequest(
            "SupplierReturn", Guid.CreateVersion7(),
            [
                new StockDeductionLine(medicineA, 2m),
                new StockDeductionLine(medicineB, 3m, b2.Id),
                new StockDeductionLine(medicineB, 4m),
            ]));

        results.Count.ShouldBe(3);
        results[0].MedicineId.ShouldBe(medicineA);
        results[0].Batches.ShouldHaveSingleItem().BatchId.ShouldBe(a1.Id);
        results[1].QuantityDeducted.ShouldBe(3m);
        results[1].Batches.ShouldHaveSingleItem().BatchId.ShouldBe(b2.Id);
        results[2].QuantityDeducted.ShouldBe(4m);
        results[2].Batches.ShouldHaveSingleItem().BatchId.ShouldBe(b1.Id);
    }

    public void Dispose() => _db.Dispose();
}
