using System.Net;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Inventory.Contracts.Services;
using FSH.Modules.Inventory.Data;
using FSH.Modules.Inventory.Domain;
using FSH.Modules.Inventory.Services;
using FSH.Modules.Multitenancy.Contracts;
using Microsoft.EntityFrameworkCore;
using NSubstitute;

namespace Inventory.Tests.Features;

/// <summary>Voiding a goods receipt takes its stock back out of the lots the receipt created, at the
/// receipt's branch — never FEFO across other lots at the caller's branch, and never tagged as a sale.</summary>
public sealed class StockReceiptReversalTests : IDisposable
{
    private static readonly DateOnly Expiry = DateOnly.FromDateTime(DateTime.UtcNow.AddYears(1));
    private readonly InventoryDbContext _db = InventoryDbContextFactory.Create();
    private readonly Guid _receiptBranch = Guid.CreateVersion7();
    private readonly Guid _callerBranch = Guid.CreateVersion7();
    private readonly Guid _medicine = Guid.CreateVersion7();

    public void Dispose() => _db.Dispose();

    private StockReceiptService Sut()
    {
        // The caller works at a DIFFERENT branch from the receipt: the reversal must ignore it.
        var currentBranch = Substitute.For<ICurrentBranch>();
        currentBranch.RequireBranchIdAsync(Arg.Any<CancellationToken>()).Returns(_callerBranch);
        return new StockReceiptService(_db, currentBranch);
    }

    private async Task<(Guid ReceiptId, Guid BatchId)> ReceiveAsync(string batchNo, decimal quantity)
    {
        var receiptId = Guid.CreateVersion7();
        var results = await Sut().ReceiveAsync(new StockReceiptRequest(
            "DirectGoodsReceipt", receiptId, [new StockReceiptLine(_medicine, batchNo, Expiry, quantity, 5m, 8m)], _receiptBranch));
        _db.ChangeTracker.Clear();
        return (receiptId, results[0].BatchId);
    }

    private void AddLot(Guid branchId, string batchNo, decimal quantity, DateOnly expiry) =>
        _db.MedicineBatches.Add(MedicineBatch.Create(_medicine, branchId, batchNo, expiry, quantity, 4m, 8m, null));

    [Fact]
    public async Task Reverse_Should_Deduct_The_Named_Lot_At_The_Receipt_Branch_Tagged_PurchaseReversal()
    {
        var (receiptId, batchId) = await ReceiveAsync("LOT-1", 10m);
        // An older lot at the receipt branch that FEFO would have picked first.
        AddLot(_receiptBranch, "OLDER", 50m, Expiry.AddMonths(-6));
        await _db.SaveChangesAsync();

        await Sut().ReverseReceiptAsync(new StockReceiptReversalRequest(
            "DirectGoodsReceiptVoid", receiptId, _receiptBranch, [new StockReceiptReversalLine(_medicine, 10m, batchId)]));

        _db.ChangeTracker.Clear();
        (await _db.MedicineBatches.SingleAsync(b => b.Id == batchId)).QuantityOnHand.ShouldBe(0m);
        (await _db.MedicineBatches.SingleAsync(b => b.BatchNo == "OLDER")).QuantityOnHand.ShouldBe(50m);
        var reversal = await _db.InventoryTransactions.SingleAsync(t => t.ReferenceType == "DirectGoodsReceiptVoid");
        reversal.Type.ShouldBe(InventoryTransactionType.PurchaseReversal);
        reversal.QuantityDelta.ShouldBe(-10m);
        reversal.BranchId.ShouldBe(_receiptBranch);
    }

    [Fact]
    public async Task Reverse_Should_Fail_Clearly_When_The_Lot_Was_Partly_Sold_And_Move_Nothing()
    {
        var (receiptId, batchId) = await ReceiveAsync("LOT-1", 10m);
        var lot = await _db.MedicineBatches.SingleAsync(b => b.Id == batchId);
        lot.Deduct(4m); // sold since
        AddLot(_receiptBranch, "OTHER", 50m, Expiry);
        await _db.SaveChangesAsync();
        _db.ChangeTracker.Clear();

        var ex = await Should.ThrowAsync<CustomException>(() => Sut().ReverseReceiptAsync(new StockReceiptReversalRequest(
            "DirectGoodsReceiptVoid", receiptId, _receiptBranch, [new StockReceiptReversalLine(_medicine, 10m, batchId)])).AsTask());

        ex.StatusCode.ShouldBe(HttpStatusCode.Conflict);
        ex.ErrorMessages!.ShouldHaveSingleItem().ShouldContain("LOT-1");
        _db.ChangeTracker.Clear();
        (await _db.MedicineBatches.SingleAsync(b => b.Id == batchId)).QuantityOnHand.ShouldBe(6m);
        (await _db.MedicineBatches.SingleAsync(b => b.BatchNo == "OTHER")).QuantityOnHand.ShouldBe(50m);
        (await _db.InventoryTransactions.AnyAsync(t => t.Type == InventoryTransactionType.PurchaseReversal)).ShouldBeFalse();
    }

    [Fact]
    public async Task Reverse_Of_A_Legacy_Line_Should_Find_The_Lot_From_The_Receipts_Own_Transactions()
    {
        var (receiptId, batchId) = await ReceiveAsync("LOT-1", 10m);
        AddLot(_receiptBranch, "OLDER", 50m, Expiry.AddMonths(-6));
        await _db.SaveChangesAsync();

        await Sut().ReverseReceiptAsync(new StockReceiptReversalRequest(
            "DirectGoodsReceiptVoid", receiptId, _receiptBranch, [new StockReceiptReversalLine(_medicine, 10m)],
            OriginalReferenceType: "DirectGoodsReceipt", OriginalReferenceId: receiptId));

        _db.ChangeTracker.Clear();
        (await _db.MedicineBatches.SingleAsync(b => b.Id == batchId)).QuantityOnHand.ShouldBe(0m);
        (await _db.MedicineBatches.SingleAsync(b => b.BatchNo == "OLDER")).QuantityOnHand.ShouldBe(50m);
    }

    [Fact]
    public async Task Reverse_With_No_Lot_Information_Should_Draw_Only_From_The_Receipt_Branch()
    {
        AddLot(_receiptBranch, "AT-RECEIPT-BRANCH", 10m, Expiry);
        AddLot(_callerBranch, "AT-CALLER-BRANCH", 100m, Expiry.AddMonths(-6));
        await _db.SaveChangesAsync();
        _db.ChangeTracker.Clear();

        await Sut().ReverseReceiptAsync(new StockReceiptReversalRequest(
            "DirectGoodsReceiptVoid", Guid.CreateVersion7(), _receiptBranch, [new StockReceiptReversalLine(_medicine, 10m)],
            OriginalReferenceType: "DirectGoodsReceipt", OriginalReferenceId: Guid.CreateVersion7()));

        _db.ChangeTracker.Clear();
        (await _db.MedicineBatches.SingleAsync(b => b.BatchNo == "AT-RECEIPT-BRANCH")).QuantityOnHand.ShouldBe(0m);
        (await _db.MedicineBatches.SingleAsync(b => b.BatchNo == "AT-CALLER-BRANCH")).QuantityOnHand.ShouldBe(100m);
    }

    [Fact]
    public async Task Receive_Of_The_Same_New_Lot_On_Two_Lines_Should_Create_One_Lot()
    {
        await Sut().ReceiveAsync(new StockReceiptRequest(
            "DirectGoodsReceipt", Guid.CreateVersion7(),
            [
                new StockReceiptLine(_medicine, "TWICE", Expiry, 3m, 5m, 8m),
                new StockReceiptLine(_medicine, "twice", Expiry, 4m, 5m, 8m),
            ],
            _receiptBranch));

        _db.ChangeTracker.Clear();
        (await _db.MedicineBatches.SingleAsync(b => b.BatchNo == "TWICE")).QuantityOnHand.ShouldBe(7m);
    }
}
