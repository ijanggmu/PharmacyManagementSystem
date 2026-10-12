using FSH.Modules.Inventory.Contracts.Services;
using FSH.Modules.Inventory.Data;
using FSH.Modules.Inventory.Domain;
using FSH.Modules.Inventory.Services;
using FSH.Modules.Multitenancy.Contracts;
using NSubstitute;

namespace Inventory.Tests.Features;

/// <summary>Stock that leaves for a supplier or a voided receipt leaves the exact batch it belongs to.</summary>
public sealed class ReceiptReversalAndNamedBatchTests : IDisposable
{
    private readonly InventoryDbContext _db = InventoryDbContextFactory.Create();
    private readonly Guid _branchId = Guid.CreateVersion7();
    private readonly ICurrentBranch _currentBranch = Substitute.For<ICurrentBranch>();

    public ReceiptReversalAndNamedBatchTests() =>
        _currentBranch.RequireBranchIdAsync(Arg.Any<CancellationToken>()).Returns(_branchId);

    private static DateOnly InMonths(int months) => DateOnly.FromDateTime(DateTime.UtcNow.AddMonths(months));

    private async Task<MedicineBatch> SeedBatchAsync(Guid medicineId, string batchNo, int expiresInMonths, decimal quantity, decimal cost)
    {
        var batch = MedicineBatch.Create(medicineId, _branchId, batchNo, InMonths(expiresInMonths), quantity, cost, cost * 2, null);
        _db.MedicineBatches.Add(batch);
        await _db.SaveChangesAsync();
        return batch;
    }

    [Fact]
    public async Task A_Supplier_Return_Naming_A_Batch_Should_Take_From_That_Batch_Not_The_Earliest_Expiring()
    {
        var medicineId = Guid.CreateVersion7();
        var soon = await SeedBatchAsync(medicineId, "SOON", 2, 10m, 5m);
        var recalled = await SeedBatchAsync(medicineId, "RECALLED", 12, 10m, 7m);
        recalled.Recall("Supplier recall", DateTime.UtcNow);
        await _db.SaveChangesAsync();

        var result = await new StockDeductionService(_db, _currentBranch).DeductForSupplierReturnAsync(
            new StockDeductionRequest("SupplierReturn", Guid.CreateVersion7(), [new StockDeductionLine(medicineId, 4m, recalled.Id)]));

        result.Single().Batches.Single().BatchId.ShouldBe(recalled.Id);
        result.Single().Batches.Single().UnitCostPrice.ShouldBe(7m);
        _db.MedicineBatches.Single(b => b.Id == recalled.Id).QuantityOnHand.ShouldBe(6m);
        _db.MedicineBatches.Single(b => b.Id == soon.Id).QuantityOnHand.ShouldBe(10m);
    }

    private async Task<(Guid ReceiptId, MedicineBatch Received, MedicineBatch Older)> ReceiveAsync()
    {
        var medicineId = Guid.CreateVersion7();
        var older = await SeedBatchAsync(medicineId, "OLDER", 2, 10m, 5m);
        var receiptId = Guid.CreateVersion7();
        var lines = await new StockReceiptService(_db, _currentBranch).ReceiveAsync(new StockReceiptRequest(
            "DirectGoodsReceipt", receiptId, [new StockReceiptLine(medicineId, "NEW-LOT", InMonths(18), 8m, 6m, 12m)]));
        var received = _db.MedicineBatches.Single(b => b.Id == lines.Single().BatchId);
        return (receiptId, received, older);
    }

    private static StockReceiptReversalRequest Void(Guid receiptId) =>
        new("DirectGoodsReceipt", receiptId, "DirectGoodsReceiptVoid", receiptId);

    [Fact]
    public async Task Voiding_A_Receipt_Should_Take_Back_Its_Own_Batch_And_Leave_Older_Stock_Alone()
    {
        var (receiptId, received, older) = await ReceiveAsync();
        var sut = new StockReceiptService(_db, _currentBranch);

        await sut.ReverseReceiptAsync(Void(receiptId));
        await sut.ReverseReceiptAsync(Void(receiptId)); // a second void request is a no-op

        _db.MedicineBatches.Single(b => b.Id == received.Id).QuantityOnHand.ShouldBe(0m);
        _db.MedicineBatches.Single(b => b.Id == older.Id).QuantityOnHand.ShouldBe(10m);
        _db.InventoryTransactions.Count(t => t.Type == InventoryTransactionType.PurchaseReversal).ShouldBe(1);
    }

    [Fact]
    public async Task Voiding_A_Receipt_Whose_Stock_Was_Partly_Sold_Should_Be_Refused_And_Change_Nothing()
    {
        var (receiptId, received, older) = await ReceiveAsync();
        received.Deduct(3m); // sold on since it arrived
        await _db.SaveChangesAsync();

        await Should.ThrowAsync<InsufficientStockException>(
            () => new StockReceiptService(_db, _currentBranch).ReverseReceiptAsync(Void(receiptId)).AsTask());

        _db.MedicineBatches.Single(b => b.Id == received.Id).QuantityOnHand.ShouldBe(5m);
        _db.MedicineBatches.Single(b => b.Id == older.Id).QuantityOnHand.ShouldBe(10m);
    }

    public void Dispose() => _db.Dispose();
}
